import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { prisma, BookingStatus } from "@wishubest/db";
import { HttpError, badRequest, notFound, forbidden, conflict } from "../../lib/httpError";
import { requireRole } from "../../lib/auth";
import { createAuditLog, createNotification, generateId } from "../../lib/helpers";

const BOOKING_STATUSES: BookingStatus[] = [
  "draft",
  "requested",
  "awaiting_payment",
  "confirmed",
  "cancelled",
  "completed",
  "rejected",
];

export async function registerBookingRoutes(app: FastifyInstance) {
  // ----------------------------------------------------------------
  // Patient: create a booking request
  // ----------------------------------------------------------------

  app.post("/bookings", async (request, reply) => {
    if (!(await requireRole(request, reply, ["patient"]))) return;
    const body = request.body as any;
    if (!body.providerId || !body.serviceId) throw badRequest("provider_and_service_required");

    const patient = await prisma.patientProfile.findUnique({ where: { userId: request.auth!.userId } });
    if (!patient) throw forbidden("patient_profile_required");

    const service = await prisma.providerService.findUnique({
      where: { id: body.serviceId },
      include: { provider: true, currency: true },
    });
    if (!service || service.providerId !== body.providerId) throw notFound("service_not_found");
    if (!service.isActive) throw badRequest("service_inactive");
    if (service.provider.status !== "active" || service.provider.kycStatus !== "approved") {
      throw badRequest("provider_not_available");
    }

    let locationId: string | null = null;
    if (service.serviceMode === "in_person") {
      if (body.locationId) {
        const location = await prisma.providerLocation.findFirst({
          where: { id: body.locationId, providerId: service.providerId },
        });
        if (!location) throw badRequest("invalid_location");
        locationId = location.id;
      } else {
        const primary = await prisma.providerLocation.findFirst({
          where: { providerId: service.providerId, isPrimary: true },
        });
        locationId = primary?.id ?? null;
      }
      if (!locationId) throw badRequest("provider_location_required");
    }

    const bookingNo = generateId("BK", 8);
    const booking = await prisma.booking.create({
      data: {
        bookingNo,
        patientId: patient.id,
        providerId: service.providerId,
        serviceId: service.id,
        serviceModeSnapshot: service.serviceMode,
        priceSnapshotMinor: service.priceMinor,
        currencyCodeSnapshot: service.currency.code,
        platformFeeBpsSnapshot: service.provider.platformFeeBps,
        locationId,
        scheduledFor: body.scheduledFor ? new Date(body.scheduledFor) : null,
        patientNotes: body.patientNotes ?? null,
        status: "requested",
      },
      include: {
        provider: { include: { user: { select: { id: true } } } },
        service: true,
        location: true,
      },
    });

    await createAuditLog({
      actorId: request.auth!.userId,
      action: "booking.create",
      entityType: "Booking",
      entityId: booking.id,
      metadata: { bookingNo },
      ip: request.ip,
    });
    await createNotification({
      userId: booking.provider.user.id,
      type: "booking_requested",
      title: "New booking request",
      body: `A patient requested: ${service.title}`,
      payload: { bookingId: booking.id },
    });

    reply.code(201).send({ booking: serializeBooking(booking) });
  });

  // ----------------------------------------------------------------
  // Provider: confirm / reject a booking (manual confirmation)
  // ----------------------------------------------------------------

  app.post("/bookings/:id/confirm", async (request, reply) => {
    if (!(await requireRole(request, reply, ["provider"]))) return;
    const { id } = request.params as { id: string };
    const provider = await prisma.providerProfile.findUnique({
      where: { userId: request.auth!.userId },
    });
    if (!provider) throw forbidden("provider_profile_required");

    const booking = await prisma.booking.findFirst({
      where: { id, providerId: provider.id },
      include: { service: true, patient: { include: { user: { select: { id: true } } } } },
    });
    if (!booking) throw notFound("booking_not_found");
    if (booking.status !== "requested") throw conflict("booking_not_requested");

    const body = request.body as any;
    if (booking.serviceModeSnapshot === "online") {
      if (typeof body.meetingLink !== "string" || body.meetingLink.trim().length < 4) {
        throw badRequest("meeting_link_required");
      }
      if (!/^https?:\/\//i.test(body.meetingLink.trim())) {
        throw badRequest("meeting_link_must_be_url");
      }
    }

    const feeMinor = Math.floor(
      (booking.priceSnapshotMinor * booking.platformFeeBpsSnapshot) / 10000
    );

    // 1. Update booking -> awaiting_payment
    // 2. Create invoice with line items (snapshot at confirmation time)
    const invoiceNo = generateId("INV", 8);
    const updated = await prisma.$transaction(async (tx) => {
      const bookingUpdated = await tx.booking.update({
        where: { id: booking.id },
        data: {
          status: "awaiting_payment",
          confirmedAt: new Date(),
          meetingLink:
            booking.serviceModeSnapshot === "online" ? body.meetingLink.trim() : null,
        },
      });
      const invoice = await tx.invoice.create({
        data: {
          invoiceNo,
          bookingId: booking.id,
          status: "issued",
          subtotalMinor: booking.priceSnapshotMinor,
          platformFeeMinor: feeMinor,
          totalMinor: booking.priceSnapshotMinor,
          currencyCode: booking.currencyCodeSnapshot,
          dueAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
          lineItems: {
            create: [
              {
                description: `${booking.service.title} (${booking.serviceModeSnapshot})`,
                quantity: 1,
                unitPriceMinor: booking.priceSnapshotMinor,
                totalMinor: booking.priceSnapshotMinor,
              },
              {
                description: "Platform service fee",
                quantity: 1,
                unitPriceMinor: feeMinor,
                totalMinor: feeMinor,
              },
            ],
          },
        },
      });
      return { bookingUpdated, invoice };
    });

    await createAuditLog({
      actorId: request.auth!.userId,
      action: "booking.confirm",
      entityType: "Booking",
      entityId: booking.id,
      metadata: { invoiceNo },
      ip: request.ip,
    });
    await createNotification({
      userId: booking.patient.user.id,
      type: "booking_confirmed",
      title: "Booking confirmed",
      body: "Your booking was confirmed. Proceed to payment.",
      payload: { bookingId: booking.id },
    });

    reply.send({ booking: serializeBooking(updated.bookingUpdated), invoice: updated.invoice });
  });

  app.post("/bookings/:id/reject", async (request, reply) => {
    if (!(await requireRole(request, reply, ["provider"]))) return;
    const { id } = request.params as { id: string };
    const provider = await prisma.providerProfile.findUnique({
      where: { userId: request.auth!.userId },
    });
    if (!provider) throw forbidden("provider_profile_required");
    const booking = await prisma.booking.findFirst({
      where: { id, providerId: provider.id },
      include: { patient: { include: { user: { select: { id: true } } } } },
    });
    if (!booking) throw notFound("booking_not_found");
    if (booking.status !== "requested") throw conflict("booking_not_requested");

    const body = request.body as any;
    const reason = body.reason ?? null;
    await prisma.booking.update({
      where: { id },
      data: { status: "rejected", rejectedAt: new Date(), cancelledReason: reason },
    });
    await createAuditLog({
      actorId: request.auth!.userId,
      action: "booking.reject",
      entityType: "Booking",
      entityId: id,
      metadata: { reason },
      ip: request.ip,
    });
    await createNotification({
      userId: booking.patient.user.id,
      type: "booking_rejected",
      title: "Booking rejected",
      body: reason ?? "Your booking request was declined.",
      payload: { bookingId: booking.id },
    });
    reply.send({ ok: true });
  });

  // ----------------------------------------------------------------
  // Patient: cancel before payment; Provider: cancel any time
  // ----------------------------------------------------------------

  app.post("/bookings/:id/cancel", async (request, reply) => {
    if (!(await requireAuthAny(request, reply))) return;
    const { id } = request.params as { id: string };
    const role = request.auth!.role;

    const booking = await prisma.booking.findUnique({
      where: { id },
      include: {
        patient: { include: { user: { select: { id: true } } } },
        provider: { include: { user: { select: { id: true } } } },
      },
    });
    if (!booking) throw notFound("booking_not_found");

    const isPatient = role === "patient" && booking.patient.userId === request.auth!.userId;
    const isProvider = role === "provider" && booking.provider.userId === request.auth!.userId;
    if (!isPatient && !isProvider) throw forbidden("not_booking_party");

    if (booking.status !== "requested" && booking.status !== "awaiting_payment") {
      throw conflict("booking_not_cancellable");
    }

    const body = request.body as any;
    await prisma.booking.update({
      where: { id },
      data: { status: "cancelled", cancelledAt: new Date(), cancelledReason: body.reason ?? null },
    });
    await createAuditLog({
      actorId: request.auth!.userId,
      action: "booking.cancel",
      entityType: "Booking",
      entityId: id,
      metadata: { reason: body.reason ?? null },
      ip: request.ip,
    });

    const otherPartyId = isPatient ? booking.provider.user.id : booking.patient.user.id;
    await createNotification({
      userId: otherPartyId,
      type: "booking_cancelled",
      title: "Booking cancelled",
      body: "A booking was cancelled.",
      payload: { bookingId: booking.id },
    });

    reply.send({ ok: true });
  });

  // ----------------------------------------------------------------
  // Provider: complete a booking
  // ----------------------------------------------------------------

  app.post("/bookings/:id/complete", async (request, reply) => {
    if (!(await requireRole(request, reply, ["provider"]))) return;
    const { id } = request.params as { id: string };
    const provider = await prisma.providerProfile.findUnique({
      where: { userId: request.auth!.userId },
    });
    if (!provider) throw forbidden("provider_profile_required");
    const booking = await prisma.booking.findFirst({
      where: { id, providerId: provider.id },
      include: { patient: { include: { user: { select: { id: true } } } } },
    });
    if (!booking) throw notFound("booking_not_found");
    if (booking.status !== "confirmed") throw conflict("booking_not_confirmed");

    const updated = await prisma.booking.update({
      where: { id },
      data: { status: "completed", completedAt: new Date() },
    });
    await createAuditLog({
      actorId: request.auth!.userId,
      action: "booking.complete",
      entityType: "Booking",
      entityId: id,
      ip: request.ip,
    });
    await createNotification({
      userId: booking.patient.user.id,
      type: "booking_completed",
      title: "Visit completed",
      body: "Your visit was completed. You can leave a review.",
      payload: { bookingId: booking.id },
    });
    reply.send({ booking: serializeBooking(updated) });
  });

  // ----------------------------------------------------------------
  // Booking lists (per role)
  // ----------------------------------------------------------------

  app.get("/bookings", async (request, reply) => {
    if (!(await requireAuthAny(request, reply))) return;
    const role = request.auth!.role;
    const { status } = request.query as { status?: string };
    const where: any = {};
    if (role === "patient") {
      const patient = await prisma.patientProfile.findUnique({ where: { userId: request.auth!.userId } });
      if (!patient) throw forbidden("patient_profile_required");
      where.patientId = patient.id;
    } else if (role === "provider") {
      const provider = await prisma.providerProfile.findUnique({ where: { userId: request.auth!.userId } });
      if (!provider) throw forbidden("provider_profile_required");
      where.providerId = provider.id;
    } else {
      return reply.send({ bookings: [] });
    }
    if (status && BOOKING_STATUSES.includes(status as BookingStatus)) where.status = status;

    const bookings = await prisma.booking.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        service: true,
        location: { include: { city: true } },
        provider: { include: { user: { select: { email: true } } } },
        patient: { include: { user: { select: { email: true } } } },
        invoice: { include: { payments: true } },
      },
    });
    reply.send({ bookings: bookings.map((b) => serializeBooking(b)) });
  });

  // GET /bookings/:id — detail for both parties
  app.get("/bookings/:id", async (request, reply) => {
    if (!(await requireAuthAny(request, reply))) return;
    const { id } = request.params as { id: string };
    const booking = await prisma.booking.findUnique({
      where: { id },
      include: {
        service: true,
        location: { include: { city: true } },
        provider: { include: { user: { select: { email: true } } } },
        patient: { include: { user: { select: { email: true } } } },
        invoice: { include: { lineItems: true, payments: true } },
        review: true,
      },
    });
    if (!booking) throw notFound("booking_not_found");
    const isPatient = booking.patient.userId === request.auth!.userId;
    const isProvider = booking.provider.userId === request.auth!.userId;
    if (!isPatient && !isProvider) throw forbidden("not_booking_party");
    reply.send({ booking: serializeBooking(booking) });
  });
}

async function requireAuthAny(request: FastifyRequest, reply: FastifyReply): Promise<boolean> {
  await request.authenticate(reply);
  return !!request.auth;
}

function serializeBooking(b: any) {
  return {
    id: b.id,
    bookingNo: b.bookingNo,
    status: b.status,
    serviceMode: b.serviceModeSnapshot,
    priceMinor: b.priceSnapshotMinor,
    currencyCode: b.currencyCodeSnapshot,
    platformFeeBps: b.platformFeeBpsSnapshot,
    scheduledFor: b.scheduledFor,
    patientNotes: b.patientNotes,
    meetingLink: b.meetingLink,
    requestedAt: b.requestedAt,
    confirmedAt: b.confirmedAt,
    completedAt: b.completedAt,
    cancelledAt: b.cancelledAt,
    cancelledReason: b.cancelledReason,
    rejectedAt: b.rejectedAt,
    service: b.service
      ? {
          id: b.service.id,
          title: b.service.title,
          serviceMode: b.service.serviceMode,
          durationMinutes: b.service.durationMinutes,
        }
      : null,
    location: b.location
      ? {
          id: b.location.id,
          name: b.location.name,
          address: b.location.address,
          city: b.location.city
            ? { nameEn: b.location.city.nameEn, nameFa: b.location.city.nameFa }
            : null,
        }
      : null,
    provider: b.provider
      ? {
          id: b.provider.id,
          userId: b.provider.userId,
          title: b.provider.title,
          specialty: b.provider.specialty,
          email: b.provider.user?.email,
        }
      : null,
    patient: b.patient
      ? {
          id: b.patient.id,
          userId: b.patient.userId,
          firstName: b.patient.firstName,
          lastName: b.patient.lastName,
          email: b.patient.user?.email,
        }
      : null,
    invoice: b.invoice
      ? {
          id: b.invoice.id,
          invoiceNo: b.invoice.invoiceNo,
          status: b.invoice.status,
          subtotalMinor: b.invoice.subtotalMinor,
          platformFeeMinor: b.invoice.platformFeeMinor,
          totalMinor: b.invoice.totalMinor,
          currencyCode: b.invoice.currencyCode,
          issuedAt: b.invoice.issuedAt,
          paidAt: b.invoice.paidAt,
          lineItems: (b.invoice.lineItems ?? []).map((li: any) => ({
            id: li.id,
            description: li.description,
            quantity: li.quantity,
            unitPriceMinor: li.unitPriceMinor,
            totalMinor: li.totalMinor,
          })),
          payments: (b.invoice.payments ?? []).map((p: any) => ({
            id: p.id,
            status: p.status,
            amountMinor: p.amountMinor,
            method: p.method,
            createdAt: p.createdAt,
          })),
        }
      : null,
  };
}