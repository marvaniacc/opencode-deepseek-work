import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "@wishubest/db";
import { badRequest, notFound } from "../../lib/httpError";
import { requireRole } from "../../lib/auth";
import { createAuditLog } from "../../lib/helpers";
import { createStorageDriver } from "../../lib/storage";
import { loadConfig } from "../../config";

export async function registerProviderRoutes(app: FastifyInstance) {
  const config = loadConfig();

  // Helper: load the provider profile for the current user (doctor only in MVP)
  async function currentProvider(request: FastifyRequest, reply: FastifyReply): Promise<any | null> {
    if (!(await requireRole(request, reply, ["provider"]))) return null;
    const provider = await prisma.providerProfile.findUnique({
      where: { userId: request.auth!.userId },
    });
    if (!provider) {
      reply.code(404).send({ error: "provider_profile_not_found" });
      return null;
    }
    return provider;
  }

  // ----------------------------------------------------------------
  // Onboarding / profile
  // ----------------------------------------------------------------

  // GET /provider/profile — own provider profile
  app.get("/provider/profile", async (request, reply) => {
    const provider = await currentProvider(request, reply);
    if (!provider) return;
    const profile = await prisma.providerProfile.findUnique({
      where: { id: provider.id },
      include: {
        user: { select: { email: true, locale: true } },
        kycDocuments: true,
        locations: { include: { city: true } },
        services: { include: { currency: true } },
        _count: { select: { bookings: true } },
      },
    });
    reply.send({ provider: profile });
  });

  // PUT /provider/profile — update bio/specialty/title
  app.put("/provider/profile", async (request, reply) => {
    const provider = await currentProvider(request, reply);
    if (!provider) return;
    const body = request.body as any;
    const updated = await prisma.providerProfile.update({
      where: { id: provider.id },
      data: {
        title: body.title !== undefined ? body.title : provider.title,
        specialty: body.specialty !== undefined ? body.specialty : provider.specialty,
        bio: body.bio !== undefined ? body.bio : provider.bio,
      },
    });
    await createAuditLog({
      actorId: request.auth!.userId,
      action: "provider.profile.update",
      entityType: "ProviderProfile",
      entityId: provider.id,
      ip: request.ip,
    });
    reply.send({ provider: updated });
  });

  // ----------------------------------------------------------------
  // KYC documents
  // ----------------------------------------------------------------

  // POST /provider/kyc — upload a KYC document (multipart)
  app.post("/provider/kyc", async (request, reply) => {
    const provider = await currentProvider(request, reply);
    if (!provider) return;

    const data = await request.file();
    if (!data) throw badRequest("file_required");
    const kind = (request.query as any).kind ?? "other";
    const allowedKinds = ["passport", "medical_license", "degree", "other"];
    if (!allowedKinds.includes(kind)) throw badRequest("invalid_kyc_kind");

    const buffer = await data.toBuffer();
    if (buffer.length > 10 * 1024 * 1024) throw badRequest("file_too_large");

    const storage = createStorageDriver(config);
    const key = `kyc/${provider.id}/${Date.now()}-${data.filename.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    await storage.put(key, buffer, data.mimetype);

    const doc = await prisma.providerKycDocument.create({
      data: {
        providerId: provider.id,
        kind,
        fileKey: key,
        originalFilename: data.filename,
        mimeType: data.mimetype,
        sizeBytes: buffer.length,
      },
    });

    await prisma.providerProfile.update({
      where: { id: provider.id },
      data: { kycStatus: "submitted", status: provider.status === "rejected" ? "pending" : provider.status },
    });

    await createAuditLog({
      actorId: request.auth!.userId,
      action: "provider.kyc.upload",
      entityType: "ProviderProfile",
      entityId: provider.id,
      metadata: { kind, docId: doc.id },
      ip: request.ip,
    });

    reply.code(201).send({ document: doc });
  });

  // ----------------------------------------------------------------
  // Locations
  // ----------------------------------------------------------------

  app.get("/provider/locations", async (request, reply) => {
    const provider = await currentProvider(request, reply);
    if (!provider) return;
    const locations = await prisma.providerLocation.findMany({
      where: { providerId: provider.id },
      orderBy: { isPrimary: "desc" },
      include: { city: { include: { country: true } } },
    });
    reply.send({ locations });
  });

  app.post("/provider/locations", async (request, reply) => {
    const provider = await currentProvider(request, reply);
    if (!provider) return;
    const body = request.body as any;
    if (!body.name || !body.address || !body.cityId) throw badRequest("name_address_city_required");
    const city = await prisma.city.findUnique({ where: { id: body.cityId } });
    if (!city) throw notFound("city_not_found");

    const location = await prisma.$transaction(async (tx) => {
      if (body.isPrimary) {
        await tx.providerLocation.updateMany({
          where: { providerId: provider.id },
          data: { isPrimary: false },
        });
      }
      return tx.providerLocation.create({
        data: {
          providerId: provider.id,
          name: body.name,
          address: body.address,
          countryId: city.countryId,
          cityId: city.id,
          lat: body.lat ?? null,
          lng: body.lng ?? null,
          isPrimary: body.isPrimary ?? false,
        },
      });
    });
    await createAuditLog({
      actorId: request.auth!.userId,
      action: "provider.location.create",
      entityType: "ProviderLocation",
      entityId: location.id,
      ip: request.ip,
    });
    reply.code(201).send({ location });
  });

  app.put("/provider/locations/:id", async (request, reply) => {
    const provider = await currentProvider(request, reply);
    if (!provider) return;
    const { id } = request.params as { id: string };
    const location = await prisma.providerLocation.findFirst({ where: { id, providerId: provider.id } });
    if (!location) throw notFound("location_not_found");
    const body = request.body as any;
    let countryId = location.countryId;
    if (body.cityId && body.cityId !== location.cityId) {
      const city = await prisma.city.findUnique({ where: { id: body.cityId } });
      if (!city) throw notFound("city_not_found");
      countryId = city.countryId;
    }
    const updated = await prisma.$transaction(async (tx) => {
      if (body.isPrimary) {
        await tx.providerLocation.updateMany({
          where: { providerId: provider.id },
          data: { isPrimary: false },
        });
      }
      return tx.providerLocation.update({
        where: { id },
        data: {
          name: body.name ?? location.name,
          address: body.address ?? location.address,
          cityId: body.cityId ?? location.cityId,
          countryId,
          lat: body.lat !== undefined ? body.lat : location.lat,
          lng: body.lng !== undefined ? body.lng : location.lng,
          isPrimary: body.isPrimary ?? location.isPrimary,
        },
      });
    });
    await createAuditLog({
      actorId: request.auth!.userId,
      action: "provider.location.update",
      entityType: "ProviderLocation",
      entityId: id,
      ip: request.ip,
    });
    reply.send({ location: updated });
  });

  app.delete("/provider/locations/:id", async (request, reply) => {
    const provider = await currentProvider(request, reply);
    if (!provider) return;
    const { id } = request.params as { id: string };
    const location = await prisma.providerLocation.findFirst({ where: { id, providerId: provider.id } });
    if (!location) throw notFound("location_not_found");
    const bookings = await prisma.booking.count({ where: { locationId: id, status: { in: ["requested", "awaiting_payment", "confirmed"] } } });
    if (bookings > 0) throw badRequest("location_has_active_bookings");
    await prisma.providerLocation.delete({ where: { id } });
    await createAuditLog({
      actorId: request.auth!.userId,
      action: "provider.location.delete",
      entityType: "ProviderLocation",
      entityId: id,
      ip: request.ip,
    });
    reply.send({ ok: true });
  });

  // ----------------------------------------------------------------
  // Services (doctor only, service_mode: in_person | online)
  // ----------------------------------------------------------------

  app.get("/provider/services", async (request, reply) => {
    const provider = await currentProvider(request, reply);
    if (!provider) return;
    const services = await prisma.providerService.findMany({
      where: { providerId: provider.id },
      include: { currency: true },
      orderBy: { createdAt: "asc" },
    });
    reply.send({ services });
  });

  app.post("/provider/services", async (request, reply) => {
    const provider = await currentProvider(request, reply);
    if (!provider) return;
    const body = request.body as any;
    if (!body.title || !body.serviceMode || !body.priceMinor) throw badRequest("title_mode_price_required");
    if (body.serviceMode !== "in_person" && body.serviceMode !== "online") {
      throw badRequest("invalid_service_mode");
    }
    if (!Number.isInteger(body.priceMinor) || body.priceMinor <= 0) throw badRequest("invalid_price_minor");

    let currencyId = body.currencyId;
    if (!currencyId) {
      const def = await prisma.currency.findFirst({ where: { isDefault: true } });
      if (!def) throw badRequest("no_default_currency");
      currencyId = def.id;
    }
    const currency = await prisma.currency.findUnique({ where: { id: currencyId } });
    if (!currency) throw notFound("currency_not_found");

    const service = await prisma.providerService.create({
      data: {
        providerId: provider.id,
        serviceMode: body.serviceMode,
        title: body.title,
        description: body.description ?? null,
        priceMinor: body.priceMinor,
        currencyId: currency.id,
        durationMinutes: body.durationMinutes ?? 30,
        isActive: body.isActive ?? true,
      },
    });
    await createAuditLog({
      actorId: request.auth!.userId,
      action: "provider.service.create",
      entityType: "ProviderService",
      entityId: service.id,
      metadata: { mode: service.serviceMode },
      ip: request.ip,
    });
    reply.code(201).send({ service });
  });

  app.put("/provider/services/:id", async (request, reply) => {
    const provider = await currentProvider(request, reply);
    if (!provider) return;
    const { id } = request.params as { id: string };
    const service = await prisma.providerService.findFirst({ where: { id, providerId: provider.id } });
    if (!service) throw notFound("service_not_found");
    const body = request.body as any;
    if (body.serviceMode && body.serviceMode !== "in_person" && body.serviceMode !== "online") {
      throw badRequest("invalid_service_mode");
    }
    if (body.priceMinor !== undefined && (!Number.isInteger(body.priceMinor) || body.priceMinor <= 0)) {
      throw badRequest("invalid_price_minor");
    }
    const updated = await prisma.providerService.update({
      where: { id },
      data: {
        title: body.title ?? service.title,
        description: body.description !== undefined ? body.description : service.description,
        serviceMode: body.serviceMode ?? service.serviceMode,
        priceMinor: body.priceMinor ?? service.priceMinor,
        durationMinutes: body.durationMinutes ?? service.durationMinutes,
        isActive: body.isActive ?? service.isActive,
      },
    });
    await createAuditLog({
      actorId: request.auth!.userId,
      action: "provider.service.update",
      entityType: "ProviderService",
      entityId: id,
      ip: request.ip,
    });
    reply.send({ service: updated });
  });

  app.delete("/provider/services/:id", async (request, reply) => {
    const provider = await currentProvider(request, reply);
    if (!provider) return;
    const { id } = request.params as { id: string };
    const service = await prisma.providerService.findFirst({ where: { id, providerId: provider.id } });
    if (!service) throw notFound("service_not_found");
    const activeBookings = await prisma.booking.count({
      where: { serviceId: id, status: { in: ["requested", "awaiting_payment", "confirmed"] } },
    });
    if (activeBookings > 0) throw badRequest("service_has_active_bookings");
    await prisma.providerService.delete({ where: { id } });
    await createAuditLog({
      actorId: request.auth!.userId,
      action: "provider.service.delete",
      entityType: "ProviderService",
      entityId: id,
      ip: request.ip,
    });
    reply.send({ ok: true });
  });
}