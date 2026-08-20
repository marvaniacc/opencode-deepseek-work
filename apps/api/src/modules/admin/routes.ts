import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "@wishubest/db";
import { HttpError, badRequest, notFound, conflict } from "../../lib/httpError";
import { requireRole } from "../../lib/auth";
import { createAuditLog } from "../../lib/helpers";

export async function registerAdminRoutes(app: FastifyInstance) {
  // ----------------------------------------------------------------
  // Countries
  // ----------------------------------------------------------------

  app.get("/admin/countries", async (request, reply) => {
    if (!(await requireRole(request, reply, ["admin"]))) return;
    const countries = await prisma.country.findMany({
      orderBy: { code: "asc" },
      include: { _count: { select: { cities: true } } },
    });
    reply.send({ countries });
  });

  app.post("/admin/countries", async (request, reply) => {
    if (!(await requireRole(request, reply, ["admin"]))) return;
    const body = request.body as any;
    if (!body.code || !body.nameEn || !body.nameFa) throw badRequest("code_name_required");
    const exists = await prisma.country.findUnique({ where: { code: String(body.code).toUpperCase() } });
    if (exists) throw conflict("country_code_exists");
    const country = await prisma.country.create({
      data: {
        code: String(body.code).toUpperCase(),
        nameEn: body.nameEn,
        nameFa: body.nameFa,
        flag: body.flag ?? null,
        isActive: body.isActive ?? true,
      },
    });
    await createAuditLog({
      actorId: request.auth!.userId,
      action: "admin.country.create",
      entityType: "Country",
      entityId: country.id,
      ip: request.ip,
    });
    reply.code(201).send({ country });
  });

  app.put("/admin/countries/:id", async (request, reply) => {
    if (!(await requireRole(request, reply, ["admin"]))) return;
    const { id } = request.params as { id: string };
    const body = request.body as any;
    const country = await prisma.country.findUnique({ where: { id } });
    if (!country) throw notFound("country_not_found");
    const updated = await prisma.country.update({
      where: { id },
      data: {
        nameEn: body.nameEn ?? country.nameEn,
        nameFa: body.nameFa ?? country.nameFa,
        flag: body.flag !== undefined ? body.flag : country.flag,
        isActive: body.isActive !== undefined ? body.isActive : country.isActive,
      },
    });
    await createAuditLog({
      actorId: request.auth!.userId,
      action: "admin.country.update",
      entityType: "Country",
      entityId: id,
      ip: request.ip,
    });
    reply.send({ country: updated });
  });

  app.delete("/admin/countries/:id", async (request, reply) => {
    if (!(await requireRole(request, reply, ["admin"]))) return;
    const { id } = request.params as { id: string };
    const cities = await prisma.city.count({ where: { countryId: id } });
    if (cities > 0) throw conflict("country_has_cities");
    await prisma.country.delete({ where: { id } });
    await createAuditLog({
      actorId: request.auth!.userId,
      action: "admin.country.delete",
      entityType: "Country",
      entityId: id,
      ip: request.ip,
    });
    reply.send({ ok: true });
  });

  // ----------------------------------------------------------------
  // Cities
  // ----------------------------------------------------------------

  app.get("/admin/cities", async (request, reply) => {
    if (!(await requireRole(request, reply, ["admin"]))) return;
    const { countryId } = request.query as { countryId?: string };
    const cities = await prisma.city.findMany({
      where: countryId ? { countryId } : undefined,
      orderBy: { nameEn: "asc" },
      include: { country: true },
    });
    reply.send({ cities });
  });

  app.post("/admin/cities", async (request, reply) => {
    if (!(await requireRole(request, reply, ["admin"]))) return;
    const body = request.body as any;
    if (!body.countryId || !body.nameEn || !body.nameFa || !body.slug) {
      throw badRequest("country_name_slug_required");
    }
    const country = await prisma.country.findUnique({ where: { id: body.countryId } });
    if (!country) throw notFound("country_not_found");
    const slug = String(body.slug).toLowerCase().replace(/[^a-z0-9-]/g, "-");
    const exists = await prisma.city.findUnique({
      where: { countryId_slug: { countryId: body.countryId, slug } },
    });
    if (exists) throw conflict("city_slug_exists");
    const city = await prisma.city.create({
      data: {
        countryId: body.countryId,
        nameEn: body.nameEn,
        nameFa: body.nameFa,
        slug,
        isActive: body.isActive ?? true,
      },
    });
    await createAuditLog({
      actorId: request.auth!.userId,
      action: "admin.city.create",
      entityType: "City",
      entityId: city.id,
      ip: request.ip,
    });
    reply.code(201).send({ city });
  });

  app.put("/admin/cities/:id", async (request, reply) => {
    if (!(await requireRole(request, reply, ["admin"]))) return;
    const { id } = request.params as { id: string };
    const body = request.body as any;
    const city = await prisma.city.findUnique({ where: { id } });
    if (!city) throw notFound("city_not_found");
    const updated = await prisma.city.update({
      where: { id },
      data: {
        nameEn: body.nameEn ?? city.nameEn,
        nameFa: body.nameFa ?? city.nameFa,
        isActive: body.isActive !== undefined ? body.isActive : city.isActive,
      },
    });
    await createAuditLog({
      actorId: request.auth!.userId,
      action: "admin.city.update",
      entityType: "City",
      entityId: id,
      ip: request.ip,
    });
    reply.send({ city: updated });
  });

  app.delete("/admin/cities/:id", async (request, reply) => {
    if (!(await requireRole(request, reply, ["admin"]))) return;
    const { id } = request.params as { id: string };
    const locations = await prisma.providerLocation.count({ where: { cityId: id } });
    if (locations > 0) throw conflict("city_has_locations");
    await prisma.city.delete({ where: { id } });
    await createAuditLog({
      actorId: request.auth!.userId,
      action: "admin.city.delete",
      entityType: "City",
      entityId: id,
      ip: request.ip,
    });
    reply.send({ ok: true });
  });

  // ----------------------------------------------------------------
  // Currency (single default in this MVP)
  // ----------------------------------------------------------------

  app.get("/admin/currencies", async (request, reply) => {
    if (!(await requireRole(request, reply, ["admin"]))) return;
    const currencies = await prisma.currency.findMany({ orderBy: { code: "asc" } });
    reply.send({ currencies });
  });

  app.post("/admin/currencies", async (request, reply) => {
    if (!(await requireRole(request, reply, ["admin"]))) return;
    const body = request.body as any;
    if (!body.code || !body.name || !body.symbol) throw badRequest("code_name_symbol_required");
    const code = String(body.code).toUpperCase();
    const exists = await prisma.currency.findUnique({ where: { code } });
    if (exists) throw conflict("currency_code_exists");
    const currency = await prisma.currency.create({
      data: { code, name: body.name, symbol: body.symbol, enabled: body.enabled ?? true },
    });
    await createAuditLog({
      actorId: request.auth!.userId,
      action: "admin.currency.create",
      entityType: "Currency",
      entityId: currency.id,
      ip: request.ip,
    });
    reply.code(201).send({ currency });
  });

  app.post("/admin/currencies/:id/set-default", async (request, reply) => {
    if (!(await requireRole(request, reply, ["admin"]))) return;
    const { id } = request.params as { id: string };
    const currency = await prisma.currency.findUnique({ where: { id } });
    if (!currency) throw notFound("currency_not_found");
    await prisma.$transaction([
      prisma.currency.updateMany({ where: { isDefault: true }, data: { isDefault: false } }),
      prisma.currency.update({ where: { id }, data: { isDefault: true, enabled: true } }),
    ]);
    await createAuditLog({
      actorId: request.auth!.userId,
      action: "admin.currency.set_default",
      entityType: "Currency",
      entityId: id,
      ip: request.ip,
    });
    reply.send({ ok: true });
  });

  // ----------------------------------------------------------------
  // Users & providers
  // ----------------------------------------------------------------

  app.get("/admin/users", async (request, reply) => {
    if (!(await requireRole(request, reply, ["admin"]))) return;
    const { role, status, q, page = "1", pageSize = "20" } = request.query as any;
    const where: any = {};
    if (role) where.role = role;
    if (status) where.status = status;
    if (q) {
      where.OR = [
        { email: { contains: q, mode: "insensitive" } },
        { patientProfile: { firstName: { contains: q, mode: "insensitive" } } },
        { patientProfile: { lastName: { contains: q, mode: "insensitive" } } },
        { providerProfile: { specialty: { contains: q, mode: "insensitive" } } },
      ];
    }
    const total = await prisma.user.count({ where });
    const users = await prisma.user.findMany({
      where,
      include: { patientProfile: true, providerProfile: true, adminProfile: true },
      orderBy: { createdAt: "desc" },
      skip: (parseInt(page, 10) - 1) * parseInt(pageSize, 10),
      take: parseInt(pageSize, 10),
    });
    reply.send({
      total,
      page: parseInt(page, 10),
      users: users.map((u) => ({
        id: u.id,
        email: u.email,
        role: u.role,
        locale: u.locale,
        status: u.status,
        createdAt: u.createdAt,
        profile: {
          firstName: u.patientProfile?.firstName ?? u.providerProfile?.title,
          lastName: u.patientProfile?.lastName ?? u.providerProfile?.specialty,
          specialty: u.providerProfile?.specialty,
          providerStatus: u.providerProfile?.status,
          kycStatus: u.providerProfile?.kycStatus,
        },
      })),
    });
  });

  app.patch("/admin/users/:id", async (request, reply) => {
    if (!(await requireRole(request, reply, ["admin"]))) return;
    const { id } = request.params as { id: string };
    const body = request.body as any;
    if (body.status !== "active" && body.status !== "disabled") throw badRequest("invalid_status");
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) throw notFound("user_not_found");
    if (user.role === "admin" && body.status === "disabled") {
      const admins = await prisma.user.count({ where: { role: "admin", status: "active" } });
      if (admins <= 1) throw conflict("cannot_disable_last_admin");
    }
    await prisma.user.update({ where: { id }, data: { status: body.status } });
    await createAuditLog({
      actorId: request.auth!.userId,
      action: "admin.user.update_status",
      entityType: "User",
      entityId: id,
      metadata: { status: body.status },
      ip: request.ip,
    });
    reply.send({ ok: true });
  });

  app.get("/admin/providers", async (request, reply) => {
    if (!(await requireRole(request, reply, ["admin"]))) return;
    const providers = await prisma.providerProfile.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        user: { select: { email: true, status: true, createdAt: true } },
        _count: { select: { services: true, locations: true, bookings: true } },
      },
    });
    reply.send({
      providers: providers.map((p) => ({
        id: p.id,
        userId: p.userId,
        email: p.user.email,
        userStatus: p.user.status,
        providerType: p.providerType,
        title: p.title,
        specialty: p.specialty,
        status: p.status,
        kycStatus: p.kycStatus,
        platformFeeBps: p.platformFeeBps,
        createdAt: p.createdAt,
        counts: { services: p._count.services, locations: p._count.locations, bookings: p._count.bookings },
      })),
    });
  });

  app.post("/admin/providers/:id/kyc", async (request, reply) => {
    if (!(await requireRole(request, reply, ["admin"]))) return;
    const { id } = request.params as { id: string };
    const body = request.body as any;
    const action = body.action;
    if (action !== "approve" && action !== "reject") throw badRequest("action_must_be_approve_or_reject");
    const provider = await prisma.providerProfile.findUnique({ where: { id } });
    if (!provider) throw notFound("provider_not_found");
    await prisma.providerProfile.update({
      where: { id },
      data: {
        kycStatus: action === "approve" ? "approved" : "rejected",
        status: action === "approve" ? "active" : "pending",
        verifiedAt: action === "approve" ? new Date() : provider.verifiedAt,
      },
    });
    await createAuditLog({
      actorId: request.auth!.userId,
      action: `admin.provider.kyc_${action}`,
      entityType: "ProviderProfile",
      entityId: id,
      metadata: { note: body.note ?? null },
      ip: request.ip,
    });
    reply.send({ ok: true });
  });

  // ----------------------------------------------------------------
  // Audit log
  // ----------------------------------------------------------------

  app.get("/admin/audit-logs", async (request, reply) => {
    if (!(await requireRole(request, reply, ["admin"]))) return;
    const { entityType, entityId, action, page = "1", pageSize = "20" } = request.query as any;
    const where: any = {};
    if (entityType) where.entityType = entityType;
    if (entityId) where.entityId = entityId;
    if (action) where.action = action;
    const total = await prisma.auditLog.count({ where });
    const logs = await prisma.auditLog.findMany({
      where,
      include: { actor: { select: { email: true } } },
      orderBy: { createdAt: "desc" },
      skip: (parseInt(page, 10) - 1) * parseInt(pageSize, 10),
      take: parseInt(pageSize, 10),
    });
    reply.send({
      total,
      page: parseInt(page, 10),
      logs: logs.map((l) => ({
        id: l.id,
        action: l.action,
        actorEmail: l.actor?.email ?? null,
        entityType: l.entityType,
        entityId: l.entityId,
        metadata: l.metadataJson,
        ip: l.ip,
        createdAt: l.createdAt,
      })),
    });
  });
}