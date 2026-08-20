import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "@wishubest/db";
import { badRequest, notFound, forbidden, conflict } from "../../lib/httpError";
import { requireRole, requireAuth } from "../../lib/auth";
import { createStorageDriver, createDownloadTicket, verifyDownloadTicket } from "../../lib/storage";
import { loadConfig } from "../../config";
import { createAuditLog } from "../../lib/helpers";

const ALLOWED_MIME = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];
const MAX_SIZE = 10 * 1024 * 1024;

export async function registerDocumentRoutes(app: FastifyInstance) {
  const config = loadConfig();
  const storage = () => createStorageDriver(config);

  // ----------------------------------------------------------------
  // Patient: upload a medical document (private bucket only)
  // ----------------------------------------------------------------

  app.post("/documents/upload", async (request, reply) => {
    if (!(await requireRole(request, reply, ["patient"]))) return;
    const patient = await prisma.patientProfile.findUnique({
      where: { userId: request.auth!.userId },
    });
    if (!patient) throw forbidden("patient_profile_required");

    const data = await request.file();
    if (!data) throw badRequest("file_required");
    if (!ALLOWED_MIME.includes(data.mimetype)) throw badRequest("unsupported_file_type");
    const buffer = await data.toBuffer();
    if (buffer.length > MAX_SIZE) throw badRequest("file_too_large");

    const fields = data.fields as Record<string, any>;
    const title = typeof fields?.title?.value === "string" ? fields.title.value : null;
    const description = typeof fields?.description?.value === "string" ? fields.description.value : null;

    const key = `medical/${patient.id}/${Date.now()}-${data.filename.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    await storage().put(key, buffer, data.mimetype);

    const doc = await prisma.patientMedicalDocument.create({
      data: {
        patientId: patient.id,
        fileKey: key,
        originalFilename: data.filename,
        mimeType: data.mimetype,
        sizeBytes: buffer.length,
        title,
        description,
      },
    });

    await createAuditLog({
      actorId: request.auth!.userId,
      action: "document.upload",
      entityType: "PatientMedicalDocument",
      entityId: doc.id,
      metadata: { sizeBytes: buffer.length },
      ip: request.ip,
    });

    reply.code(201).send({ document: serializeDoc(doc) });
  });

  // ----------------------------------------------------------------
  // Patient: list own documents
  // ----------------------------------------------------------------

  app.get("/documents", async (request, reply) => {
    if (!(await requireRole(request, reply, ["patient"]))) return;
    const patient = await prisma.patientProfile.findUnique({
      where: { userId: request.auth!.userId },
    });
    if (!patient) throw forbidden("patient_profile_required");
    const docs = await prisma.patientMedicalDocument.findMany({
      where: { patientId: patient.id },
      orderBy: { uploadedAt: "desc" },
    });
    reply.send({ documents: docs.map((d) => serializeDoc(d)) });
  });

  // ----------------------------------------------------------------
  // Patient: update / archive a document
  // ----------------------------------------------------------------

  app.patch("/documents/:id", async (request, reply) => {
    if (!(await requireRole(request, reply, ["patient"]))) return;
    const { id } = request.params as { id: string };
    const patient = await prisma.patientProfile.findUnique({
      where: { userId: request.auth!.userId },
    });
    if (!patient) throw forbidden("patient_profile_required");
    const doc = await prisma.patientMedicalDocument.findFirst({
      where: { id, patientId: patient.id },
    });
    if (!doc) throw notFound("document_not_found");
    const body = request.body as any;
    const updated = await prisma.patientMedicalDocument.update({
      where: { id },
      data: {
        title: body.title !== undefined ? body.title : doc.title,
        description: body.description !== undefined ? body.description : doc.description,
      },
    });
    reply.send({ document: serializeDoc(updated) });
  });

  app.post("/documents/:id/archive", async (request, reply) => {
    if (!(await requireRole(request, reply, ["patient"]))) return;
    const { id } = request.params as { id: string };
    const patient = await prisma.patientProfile.findUnique({
      where: { userId: request.auth!.userId },
    });
    if (!patient) throw forbidden("patient_profile_required");
    const doc = await prisma.patientMedicalDocument.findFirst({
      where: { id, patientId: patient.id },
    });
    if (!doc) throw notFound("document_not_found");
    await prisma.patientMedicalDocument.update({
      where: { id },
      data: { status: "archived", archivedAt: new Date() },
    });
    await storage().delete(doc.fileKey);
    reply.send({ ok: true });
  });

  // ----------------------------------------------------------------
  // Grants (patient → provider, MVP level; not per-document)
  // ----------------------------------------------------------------

  app.get("/documents/grants", async (request, reply) => {
    if (!(await requireRole(request, reply, ["patient"]))) return;
    const patient = await prisma.patientProfile.findUnique({
      where: { userId: request.auth!.userId },
    });
    if (!patient) throw forbidden("patient_profile_required");
    const grants = await prisma.medicalDocumentAccessGrant.findMany({
      where: { patientId: patient.id },
      include: {
        provider: { include: { user: { select: { email: true } } } },
        patient: { select: { id: true } },
      },
      orderBy: { grantedAt: "desc" },
    });
    reply.send({
      grants: grants.map((g) => ({
        id: g.id,
        providerId: g.providerId,
        providerName: `${g.provider.title ?? ""} ${g.provider.specialty ?? ""}`.trim(),
        grantedAt: g.grantedAt,
        revokedAt: g.revokedAt,
        active: g.revokedAt === null,
      })),
    });
  });

  app.post("/documents/grants", async (request, reply) => {
    if (!(await requireRole(request, reply, ["patient"]))) return;
    const patient = await prisma.patientProfile.findUnique({
      where: { userId: request.auth!.userId },
    });
    if (!patient) throw forbidden("patient_profile_required");
    const body = request.body as any;
    if (!body.providerId) throw badRequest("provider_required");
    const provider = await prisma.providerProfile.findFirst({
      where: { id: body.providerId, providerType: "doctor" },
    });
    if (!provider) throw notFound("provider_not_found");

    const grant = await prisma.medicalDocumentAccessGrant.upsert({
      where: { patientId_providerId: { patientId: patient.id, providerId: provider.id } },
      update: { revokedAt: null, grantedAt: new Date(), grantedBy: request.auth!.userId },
      create: {
        patientId: patient.id,
        providerId: provider.id,
        grantedBy: request.auth!.userId,
      },
    });
    await createAuditLog({
      actorId: request.auth!.userId,
      action: "document.grant",
      entityType: "MedicalDocumentAccessGrant",
      entityId: grant.id,
      ip: request.ip,
    });
    reply.send({ grant });
  });

  app.post("/documents/grants/:providerId/revoke", async (request, reply) => {
    if (!(await requireRole(request, reply, ["patient"]))) return;
    const { providerId } = request.params as { providerId: string };
    const patient = await prisma.patientProfile.findUnique({
      where: { userId: request.auth!.userId },
    });
    if (!patient) throw forbidden("patient_profile_required");
    const grant = await prisma.medicalDocumentAccessGrant.findUnique({
      where: { patientId_providerId: { patientId: patient.id, providerId } },
    });
    if (!grant) throw notFound("grant_not_found");
    await prisma.medicalDocumentAccessGrant.update({
      where: { id: grant.id },
      data: { revokedAt: new Date() },
    });
    await createAuditLog({
      actorId: request.auth!.userId,
      action: "document.grant.revoke",
      entityType: "MedicalDocumentAccessGrant",
      entityId: grant.id,
      ip: request.ip,
    });
    reply.send({ ok: true });
  });

  // ----------------------------------------------------------------
  // Download: authorization + short-lived signed ticket
  // ----------------------------------------------------------------

  // Step 1: authorize and mint a short-lived ticket
  app.post("/documents/:id/download", async (request, reply) => {
    if (!(await requireAuth(request, reply))) return;
    const { id } = request.params as { id: string };
    const doc = await prisma.patientMedicalDocument.findUnique({ where: { id } });
    if (!doc || doc.status !== "active") throw notFound("document_not_found");

    if (!(await canDownload(request, doc))) throw forbidden("no_access_to_document");

    if (request.auth!.role === "admin") {
      await createAuditLog({
        actorId: request.auth!.userId,
        action: "document.download.admin",
        entityType: "PatientMedicalDocument",
        entityId: doc.id,
        ip: request.ip,
      });
    }

    const { token, expiresAt } = createDownloadTicket(
      config.jwtSecret,
      doc.fileKey,
      config.docSignedUrlTtlSeconds
    );
    reply.send({ downloadUrl: `/documents/download-file?token=${token}`, expiresAt });
  });

  // Step 2: stream the file (ticket + fresh authorization check)
  app.get("/documents/download-file", async (request, reply) => {
    await request.authenticate(reply);
    if (!request.auth) return;
    const { token } = request.query as { token?: string };
    if (!token) throw badRequest("token_required");
    const ticket = verifyDownloadTicket(config.jwtSecret, token);
    if (!ticket) throw forbidden("invalid_or_expired_ticket");

    const doc = await prisma.patientMedicalDocument.findUnique({
      where: { fileKey: ticket.fileKey },
    });
    if (!doc || doc.status !== "active") throw notFound("document_not_found");

    // Re-check authorization at download time — a revoked grant kills any
    // previously issued ticket for that user.
    if (!(await canDownload(request, doc))) throw forbidden("no_access_to_document");

    reply.header("Content-Type", doc.mimeType);
    reply.header(
      "Content-Disposition",
      `attachment; filename="${doc.originalFilename.replace(/[^a-zA-Z0-9._-]/g, "_")}"`
    );

    const data = await storage().get(doc.fileKey);
    reply.send(data);
  });

  // ----------------------------------------------------------------
  // Provider: relevant patients (with grant) + their documents
  // Only patients with a booking or chat thread with this provider.
  // ----------------------------------------------------------------

  app.get("/provider/documents/patients", async (request, reply) => {
    if (!(await requireRole(request, reply, ["provider"]))) return;
    const provider = await prisma.providerProfile.findUnique({
      where: { userId: request.auth!.userId },
    });
    if (!provider) throw forbidden("provider_profile_required");

    const patients = await prisma.patientProfile.findMany({
      where: {
        accessGrants: { some: { providerId: provider.id, revokedAt: null } },
        OR: [
          { bookings: { some: { providerId: provider.id } } },
          { chatThreads: { some: { providerId: provider.id } } },
        ],
      },
      include: {
        user: { select: { email: true } },
        medicalDocuments: { where: { status: "active" } },
        accessGrants: { where: { providerId: provider.id } },
        _count: { select: { bookings: { where: { providerId: provider.id } } } },
      },
      orderBy: { updatedAt: "desc" },
    });

    reply.send({
      patients: patients.map((p) => ({
        patientId: p.id,
        firstName: p.firstName,
        lastName: p.lastName,
        email: p.user.email,
        grantedAt: p.accessGrants[0]?.grantedAt ?? null,
        bookingCount: p._count.bookings,
        documents: p.medicalDocuments.map((d) => serializeDoc(d)),
      })),
    });
  });
}

// ----------------------------------------------------------------
// Authorization helpers
// ----------------------------------------------------------------

async function canDownload(
  request: FastifyRequest,
  doc: { patientId: string; status: string }
): Promise<boolean> {
  const role = request.auth!.role;

  // Patient owns their documents.
  if (role === "patient") {
    const patient = await prisma.patientProfile.findUnique({
      where: { userId: request.auth!.userId },
    });
    return !!patient && patient.id === doc.patientId;
  }

  // Provider: active grant from this patient AND a booking or thread link.
  if (role === "provider") {
    const provider = await prisma.providerProfile.findUnique({
      where: { userId: request.auth!.userId },
    });
    if (!provider) return false;
    const grant = await prisma.medicalDocumentAccessGrant.findFirst({
      where: { patientId: doc.patientId, providerId: provider.id, revokedAt: null },
    });
    if (!grant) return false;
    const [booking, thread] = await Promise.all([
      prisma.booking.count({ where: { patientId: doc.patientId, providerId: provider.id } }),
      prisma.chatThread.count({ where: { patientId: doc.patientId, providerId: provider.id } }),
    ]);
    return booking > 0 || thread > 0;
  }

  // Admin: allowed for support, but audited at the caller.
  if (role === "admin") return true;

  return false;
}

function serializeDoc(d: any) {
  return {
    id: d.id,
    originalFilename: d.originalFilename,
    mimeType: d.mimeType,
    sizeBytes: d.sizeBytes,
    title: d.title,
    description: d.description,
    status: d.status,
    uploadedAt: d.uploadedAt,
  };
}