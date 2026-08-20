import { FastifyInstance } from "fastify";
import { prisma } from "@wishubest/db";
import { badRequest, notFound, forbidden, conflict } from "../../lib/httpError";
import { requireRole, requireAuth } from "../../lib/auth";
import { createAuditLog } from "../../lib/helpers";

export async function registerReviewRoutes(app: FastifyInstance) {
  // ----------------------------------------------------------------
  // Patient: review a completed booking (one review per booking)
  // ----------------------------------------------------------------

  app.post("/reviews", async (request, reply) => {
    if (!(await requireRole(request, reply, ["patient"]))) return;
    const patient = await prisma.patientProfile.findUnique({
      where: { userId: request.auth!.userId },
    });
    if (!patient) throw forbidden("patient_profile_required");

    const body = request.body as any;
    const rating = body.rating;
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw badRequest("rating_must_be_1_to_5");
    const comment = body.comment ? String(body.comment).slice(0, 2000) : null;

    const booking = await prisma.booking.findFirst({
      where: { id: body.bookingId, patientId: patient.id, status: "completed" },
    });
    if (!booking) throw notFound("completed_booking_required");

    const existing = await prisma.review.findUnique({ where: { bookingId: booking.id } });
    if (existing) throw conflict("booking_already_reviewed");

    const review = await prisma.review.create({
      data: {
        bookingId: booking.id,
        patientId: patient.id,
        providerId: booking.providerId,
        rating,
        comment,
        isVerified: true,
      },
    });

    await createAuditLog({
      actorId: request.auth!.userId,
      action: "review.create",
      entityType: "Review",
      entityId: review.id,
      metadata: { rating, bookingId: booking.id },
      ip: request.ip,
    });

    reply.code(201).send({ review });
  });

  // ----------------------------------------------------------------
  // Patient: my reviews
  // ----------------------------------------------------------------

  app.get("/reviews", async (request, reply) => {
    if (!(await requireRole(request, reply, ["patient"]))) return;
    const patient = await prisma.patientProfile.findUnique({
      where: { userId: request.auth!.userId },
    });
    if (!patient) throw forbidden("patient_profile_required");

    const reviews = await prisma.review.findMany({
      where: { patientId: patient.id },
      include: {
        provider: { select: { title: true, specialty: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    reply.send({
      reviews: reviews.map((r) => ({
        id: r.id,
        bookingId: r.bookingId,
        rating: r.rating,
        comment: r.comment,
        status: r.status,
        isVerified: r.isVerified,
        createdAt: r.createdAt,
        providerName: `${r.provider.title ?? ""} ${r.provider.specialty ?? ""}`.trim(),
      })),
    });
  });

  // ----------------------------------------------------------------
  // Provider: reviews received
  // ----------------------------------------------------------------

  app.get("/provider/reviews", async (request, reply) => {
    if (!(await requireRole(request, reply, ["provider"]))) return;
    const provider = await prisma.providerProfile.findUnique({
      where: { userId: request.auth!.userId },
    });
    if (!provider) throw forbidden("provider_profile_required");

    const reviews = await prisma.review.findMany({
      where: { providerId: provider.id },
      include: {
        patient: { select: { firstName: true, lastName: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    reply.send({
      reviews: reviews.map((r) => ({
        id: r.id,
        rating: r.rating,
        comment: r.comment,
        status: r.status,
        isVerified: r.isVerified,
        createdAt: r.createdAt,
        patientName: `${r.patient.firstName} ${r.patient.lastName}`.trim(),
      })),
      summary: {
        total: reviews.length,
        average: reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0,
      },
    });
  });

  // ----------------------------------------------------------------
  // Public: provider reviews (approved only)
  // ----------------------------------------------------------------

  app.get("/providers/:providerId/reviews", async (request, reply) => {
    const { providerId } = request.params as { providerId: string };
    const reviews = await prisma.review.findMany({
      where: { providerId, status: "approved" },
      include: { patient: { select: { firstName: true, lastName: true } } },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    reply.send({
      reviews: reviews.map((r) => ({
        id: r.id,
        rating: r.rating,
        comment: r.comment,
        isVerified: r.isVerified,
        createdAt: r.createdAt,
        patientName: `${r.patient.firstName} ${r.patient.lastName}`.trim(),
      })),
    });
  });

  // ----------------------------------------------------------------
  // Admin: moderation queue
  // ----------------------------------------------------------------

  app.get("/admin/reviews", async (request, reply) => {
    if (!(await requireRole(request, reply, ["admin"]))) return;
    const { status } = request.query as { status?: string };
    const reviews = await prisma.review.findMany({
      where: status ? { status: status as any } : {},
      include: {
        patient: { select: { firstName: true, lastName: true } },
        provider: { select: { title: true, specialty: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    reply.send({
      reviews: reviews.map((r) => ({
        id: r.id,
        rating: r.rating,
        comment: r.comment,
        status: r.status,
        isVerified: r.isVerified,
        createdAt: r.createdAt,
        patientName: `${r.patient.firstName} ${r.patient.lastName}`.trim(),
        providerName: `${r.provider.title ?? ""} ${r.provider.specialty ?? ""}`.trim(),
      })),
    });
  });

  app.patch("/admin/reviews/:id", async (request, reply) => {
    if (!(await requireRole(request, reply, ["admin"]))) return;
    const { id } = request.params as { id: string };
    const body = request.body as any;
    if (!["approved", "rejected"].includes(body.status)) throw badRequest("invalid_status");
    const review = await prisma.review.findUnique({ where: { id } });
    if (!review) throw notFound("review_not_found");
    const updated = await prisma.review.update({
      where: { id },
      data: { status: body.status, reviewedById: request.auth!.userId, reviewedAt: new Date() },
    });
    await createAuditLog({
      actorId: request.auth!.userId,
      action: `review.${body.status}`,
      entityType: "Review",
      entityId: id,
      ip: request.ip,
    });
    reply.send({ review: updated });
  });
}