import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { randomUUID } from "crypto";
import { prisma, Role } from "@wishubest/db";
import { loadConfig } from "../../config";
import { hashPassword, verifyPassword } from "../../lib/password";
import { HttpError, badRequest, unauthorized, forbidden, notFound } from "../../lib/httpError";
import { createAuditLog } from "../../lib/helpers";

function assertEmail(email: unknown): string {
  if (typeof email !== "string" || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw badRequest("invalid_email");
  }
  return email.toLowerCase().trim();
}

function assertPassword(password: unknown): string {
  if (typeof password !== "string" || password.length < 8) {
    throw badRequest("password_too_short");
  }
  return password;
}

export async function registerAuthRoutes(app: FastifyInstance) {
  const config = loadConfig();

  // POST /auth/register — patient or provider(doctor) self-registration
  app.post("/auth/register", async (request, reply) => {
    const body = (request.body ?? {}) as any;

    const role = body.role as Role;
    if (role !== "patient" && role !== "provider") {
      throw badRequest("role_must_be_patient_or_provider");
    }

    const email = assertEmail(body.email);
    const password = assertPassword(body.password);
    const locale = body.locale === "en" ? "en" : "fa";

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) throw badRequest("email_already_registered");

    const passwordHash = await hashPassword(password);

    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: { email, passwordHash, role, locale },
      });
      if (role === "patient") {
        const profile = body.profile ?? {};
        if (!profile.firstName || !profile.lastName) {
          throw badRequest("first_name_and_last_name_required");
        }
        await tx.patientProfile.create({
          data: {
            userId: created.id,
            firstName: profile.firstName,
            lastName: profile.lastName,
            nationalId: profile.nationalId ?? null,
            phone: profile.phone ?? null,
            dateOfBirth: profile.dateOfBirth ? new Date(profile.dateOfBirth) : null,
          },
        });
      } else {
        // Doctor only in this MVP. providerType is forced to doctor.
        await tx.providerProfile.create({
          data: {
            userId: created.id,
            providerType: "doctor",
            title: body.profile?.title ?? null,
            specialty: body.profile?.specialty ?? null,
            bio: body.profile?.bio ?? null,
            platformFeeBps: 1000,
          },
        });
      }
      return created;
    });

    const jti = randomUUID();
    await prisma.session.create({
      data: {
        userId: user.id,
        jti,
        userAgent: request.headers["user-agent"] ?? null,
        ip: request.ip,
        expiresAt: new Date(Date.now() + config.sessionTtlSeconds * 1000),
      },
    });

    const token = app.jwt.sign(
      { sub: user.id, jti, role: user.role },
      { expiresIn: config.sessionTtlSeconds }
    );
    reply.setCookie(config.authCookie, token, {
      httpOnly: true,
      secure: config.env === "production",
      sameSite: "lax",
      path: "/",
      maxAge: config.sessionTtlSeconds,
    });

    await createAuditLog({
      actorId: user.id,
      action: "auth.register",
      entityType: "User",
      entityId: user.id,
      ip: request.ip,
    });

    reply.code(201).send({ user: toPublicUser(user) });
  });

  // POST /auth/login
  app.post("/auth/login", async (request, reply) => {
    const body = (request.body ?? {}) as any;
    const email = assertEmail(body.email);
    const password = assertPassword(body.password);

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) throw unauthorized("invalid_credentials");
    if (user.status !== "active") throw forbidden("user_disabled");

    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) throw unauthorized("invalid_credentials");

    const jti = randomUUID();
    await prisma.session.create({
      data: {
        userId: user.id,
        jti,
        userAgent: request.headers["user-agent"] ?? null,
        ip: request.ip,
        expiresAt: new Date(Date.now() + config.sessionTtlSeconds * 1000),
      },
    });

    const token = app.jwt.sign(
      { sub: user.id, jti, role: user.role },
      { expiresIn: config.sessionTtlSeconds }
    );
    reply.setCookie(config.authCookie, token, {
      httpOnly: true,
      secure: config.env === "production",
      sameSite: "lax",
      path: "/",
      maxAge: config.sessionTtlSeconds,
    });

    await createAuditLog({
      actorId: user.id,
      action: "auth.login",
      entityType: "User",
      entityId: user.id,
      ip: request.ip,
    });

    reply.send({ user: toPublicUser(user) });
  });

  // POST /auth/logout — revoke current session
  app.post("/auth/logout", async (request: FastifyRequest, reply: FastifyReply) => {
    await request.authenticate(reply);
    if (!request.auth) return;
    await prisma.session.updateMany({
      where: { jti: request.auth.jti },
      data: { revokedAt: new Date() },
    });
    reply.clearCookie(config.authCookie, { path: "/" });
    reply.send({ ok: true });
  });

  // GET /auth/me — current user + profile
  app.get("/auth/me", async (request: FastifyRequest, reply: FastifyReply) => {
    await request.authenticate(reply);
    if (!request.auth) return;

    const user = await prisma.user.findUnique({
      where: { id: request.auth.userId },
      include: { patientProfile: true, providerProfile: true, adminProfile: true },
    });
    if (!user) throw notFound("user_not_found");

    reply.send({ user: toPublicUser(user) });
  });

  // GET /auth/sessions — list active sessions (own)
  app.get("/auth/sessions", async (request: FastifyRequest, reply: FastifyReply) => {
    await request.authenticate(reply);
    if (!request.auth) return;
    const sessions = await prisma.session.findMany({
      where: { userId: request.auth.userId, revokedAt: null },
      orderBy: { createdAt: "desc" },
      select: { id: true, userAgent: true, ip: true, createdAt: true, expiresAt: true },
    });
    reply.send({ sessions });
  });

  // DELETE /auth/sessions/:id — revoke a session
  app.delete("/auth/sessions/:id", async (request: FastifyRequest, reply: FastifyReply) => {
    await request.authenticate(reply);
    if (!request.auth) return;
    const { id } = request.params as { id: string };
    const session = await prisma.session.findFirst({
      where: { id, userId: request.auth.userId },
    });
    if (!session) throw notFound("session_not_found");
    await prisma.session.update({ where: { id }, data: { revokedAt: new Date() } });
    reply.send({ ok: true });
  });
}

function toPublicUser(user: any) {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    locale: user.locale,
    patientProfile: user.patientProfile
      ? {
          id: user.patientProfile.id,
          firstName: user.patientProfile.firstName,
          lastName: user.patientProfile.lastName,
          phone: user.patientProfile.phone,
          nationalId: user.patientProfile.nationalId,
          dateOfBirth: user.patientProfile.dateOfBirth,
          avatarFileKey: user.patientProfile.avatarFileKey,
        }
      : null,
    providerProfile: user.providerProfile
      ? {
          id: user.providerProfile.id,
          providerType: user.providerProfile.providerType,
          title: user.providerProfile.title,
          specialty: user.providerProfile.specialty,
          bio: user.providerProfile.bio,
          status: user.providerProfile.status,
          kycStatus: user.providerProfile.kycStatus,
          platformFeeBps: user.providerProfile.platformFeeBps,
        }
      : null,
    adminProfile: user.adminProfile
      ? { id: user.adminProfile.id, fullName: user.adminProfile.fullName, superAdmin: user.adminProfile.superAdmin }
      : null,
  };
}