import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "@wishubest/db";
import { HttpError, badRequest, notFound, forbidden, conflict } from "../../lib/httpError";
import { requireRole, requireAuth } from "../../lib/auth";
import { createAuditLog, createNotification, generateId } from "../../lib/helpers";

// Money is always integer minor units. Platform fee from basis points:
function platformFeeMinor(priceMinor: number, bps: number): number {
  return Math.floor((priceMinor * bps) / 10000);
}

export async function registerPaymentRoutes(app: FastifyInstance) {
  // ----------------------------------------------------------------
  // Mock gateway (simulates a third-party payment provider)
  // ----------------------------------------------------------------

  app.post("/payments/gateway", async (request) => {
    const body = request.body as any;
    if (!body.paymentId || !Number.isInteger(body.amountMinor) || body.amountMinor <= 0) {
      throw badRequest("invalid_gateway_request");
    }
    const payment = await prisma.payment.findUnique({ where: { id: body.paymentId } });
    if (!payment || payment.status === "succeeded") {
      // Idempotent gateway: repeat of an already-settled payment returns the same ref
      if (payment?.gatewayRef) {
        return { success: true, gatewayRef: payment.gatewayRef, status: "settled" };
      }
      throw notFound("payment_not_found");
    }

    const gatewayRef = generateId("GTR", 12);
    await prisma.paymentWebhookEvent.create({
      data: {
        gateway: "mock",
        payloadJson: { ...body, gatewayRef, settledAt: new Date().toISOString() },
      },
    });

    // In a real gateway, the provider would call our webhook with the result.
    // The mock returns immediately; settlement happens via settlePayment()
    // (same path the payment.succeeded webhook uses).
    return { success: true, gatewayRef, status: "succeeded" };
  });

  // ----------------------------------------------------------------
  // Webhook endpoint — real-world providers POST results here. Idempotent.
  // ----------------------------------------------------------------

  app.post("/payments/webhook", async (request) => {
    const body = request.body as any;
    if (!body.paymentId || !body.event) throw badRequest("invalid_webhook");

    const payment = await prisma.payment.findUnique({ where: { id: body.paymentId } });
    if (!payment) throw notFound("payment_not_found");

    const event = await prisma.paymentWebhookEvent.create({
      data: { gateway: "mock", payloadJson: body as any },
    });

    if (body.event === "payment.succeeded" && payment.status !== "succeeded") {
      await settlePayment(payment.id, body.gatewayRef ?? null);
      await prisma.paymentWebhookEvent.update({ where: { id: event.id }, data: { processed: true, processedAt: new Date() } });
      return { ok: true };
    }
    if (body.event === "payment.failed" && payment.status === "pending") {
      await prisma.payment.update({
        where: { id: payment.id },
        data: { status: "failed", failureReason: body.reason ?? "gateway_declined" },
      });
      await prisma.paymentWebhookEvent.update({ where: { id: event.id }, data: { processed: true, processedAt: new Date() } });
      return { ok: true };
    }
    return { ok: true, ignored: true };
  });

  // ----------------------------------------------------------------
  // Patient: pay for a booking (idempotent)
  // ----------------------------------------------------------------

  app.post("/bookings/:id/pay", async (request, reply) => {
    if (!(await requireRole(request, reply, ["patient"]))) return;
    const { id } = request.params as { id: string };
    const patient = await prisma.patientProfile.findUnique({ where: { userId: request.auth!.userId } });
    if (!patient) throw forbidden("patient_profile_required");

    const booking = await prisma.booking.findUnique({
      where: { id },
      include: { invoice: true, payments: true },
    });
    if (!booking || booking.patientId !== patient.id) throw notFound("booking_not_found");

    const idempotencyKey =
      (request.headers["idempotency-key"] as string) ?? `booking:${booking.id}`;

    const existing = await prisma.payment.findUnique({ where: { idempotencyKey } });
    if (existing) {
      if (existing.status === "succeeded") {
        return reply.send({
          payment: existing,
          booking: await prisma.booking.findUnique({ where: { id } }),
          idempotentReplay: true,
        });
      }
      throw conflict("payment_in_progress");
    }

    if (booking.status !== "awaiting_payment") throw conflict("booking_not_awaiting_payment");
    if (!booking.invoice) throw conflict("invoice_missing");

    const payment = await prisma.payment.create({
      data: {
        invoiceId: booking.invoice.id,
        bookingId: booking.id,
        amountMinor: booking.invoice.totalMinor,
        currencyCode: booking.invoice.currencyCode,
        method: "mock_card",
        status: "pending",
        idempotencyKey,
      },
    });

    // Call the mock gateway.
    const gateway = await app.inject({
      method: "POST",
      url: "/payments/gateway",
      payload: { paymentId: payment.id, amountMinor: payment.amountMinor, currencyCode: payment.currencyCode },
    });
    const gatewayResult = gateway.json() as any;
    if (!gatewayResult.success) {
      throw new HttpError(502, "gateway_failed");
    }

    await settlePayment(payment.id, gatewayResult.gatewayRef);

    const updated = await prisma.payment.findUnique({ where: { id: payment.id } });
    const updatedBooking = await prisma.booking.findUnique({ where: { id: booking.id } });

    const providerUser = await prisma.providerProfile.findUniqueOrThrow({
      where: { id: booking.providerId },
      include: { user: { select: { id: true } } },
    });

    await createAuditLog({
      actorId: request.auth!.userId,
      action: "payment.settled",
      entityType: "Payment",
      entityId: payment.id,
      metadata: { bookingId: booking.id, gatewayRef: gatewayResult.gatewayRef },
      ip: request.ip,
    });
    await createNotification({
      userId: providerUser.user.id,
      type: "invoice_paid",
      title: "Payment received",
      body: `Payment received for booking ${booking.bookingNo}.`,
      payload: { bookingId: booking.id, paymentId: payment.id },
    });

    reply.send({ payment: updated, booking: updatedBooking, idempotentReplay: false });
  });

  // ----------------------------------------------------------------
  // Patient: list payments (own)
  // ----------------------------------------------------------------

  app.get("/payments", async (request, reply) => {
    if (!(await requireRole(request, reply, ["patient"]))) return;
    const patient = await prisma.patientProfile.findUnique({ where: { userId: request.auth!.userId } });
    if (!patient) throw forbidden("patient_profile_required");
    const payments = await prisma.payment.findMany({
      where: { booking: { patientId: patient.id } },
      orderBy: { createdAt: "desc" },
      include: { booking: { select: { bookingNo: true, status: true } }, invoice: { select: { invoiceNo: true } } },
    });
    reply.send({ payments });
  });

  app.get("/payments/:id", async (request, reply) => {
    if (!(await requireAuth(request, reply))) return;
    const { id } = request.params as { id: string };
    const payment = await prisma.payment.findUnique({
      where: { id },
      include: { booking: { include: { provider: { include: { user: { select: { email: true } } } } } } },
    });
    if (!payment) throw notFound("payment_not_found");
    const isOwner = payment.booking.patientId === (await patientIdFor(request.auth!.userId));
    if (!isOwner && request.auth!.role !== "provider" && request.auth!.role !== "admin") {
      throw forbidden("not_payment_owner");
    }
    reply.send({ payment });
  });

  // ----------------------------------------------------------------
  // Ledger (admin view; append-only)
  // ----------------------------------------------------------------

  app.get("/admin/ledger", async (request, reply) => {
    if (!(await requireRole(request, reply, ["admin"]))) return;
    const { page = "1", pageSize = "20", accountCode } = request.query as any;
    const where: any = {};
    if (accountCode) where.accountCode = accountCode;
    const total = await prisma.ledgerEntry.count({ where });
    const entries = await prisma.ledgerEntry.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (parseInt(page, 10) - 1) * parseInt(pageSize, 10),
      take: parseInt(pageSize, 10),
    });
    reply.send({ total, page: parseInt(page, 10), entries });
  });
}

async function settlePayment(paymentId: string, gatewayRef: string | null) {
  await prisma.$transaction(async (tx) => {
    const payment = await tx.payment.findUnique({ where: { id: paymentId } });
    if (!payment) throw notFound("payment_not_found");
    if (payment.status === "succeeded") return; // idempotent

    const invoice = await tx.invoice.findUniqueOrThrow({ where: { id: payment.invoiceId } });
    const booking = await tx.booking.findUniqueOrThrow({ where: { id: payment.bookingId } });
    const totalMinor = invoice.totalMinor;
    const feeMinor = invoice.platformFeeMinor;
    const providerMinor = totalMinor - feeMinor;
    const currency = invoice.currencyCode;

    // Append-only ledger — one shared idempotency key per settlement.
    const ik = `payment:${paymentId}`;
    const existing = await tx.ledgerEntry.findUnique({ where: { idempotencyKey: ik } });
    if (existing) return;

    const startNum = await nextEntryNo(tx);
    const groupIk = `payment:${paymentId}`;
    const base = {
      currencyCode: currency,
    };
    const rows = [
      {
        ...base,
        entryNo: `LE-${String(startNum).padStart(6, "0")}`,
        idempotencyKey: `${groupIk}:platform_receivable`,
        accountCode: "platform_receivable",
        direction: "debit",
        amountMinor: totalMinor,
        referenceType: "Payment",
        referenceId: paymentId,
        description: `Payment received for booking ${booking.bookingNo}`,
      },
      {
        ...base,
        entryNo: `LE-${String(startNum + 1).padStart(6, "0")}`,
        idempotencyKey: `${groupIk}:platform_fee`,
        accountCode: "platform_fee",
        direction: "credit",
        amountMinor: feeMinor,
        referenceType: "Payment",
        referenceId: paymentId,
        description: `Platform fee for booking ${booking.bookingNo}`,
      },
      {
        ...base,
        entryNo: `LE-${String(startNum + 2).padStart(6, "0")}`,
        idempotencyKey: `${groupIk}:provider_payable`,
        accountCode: "provider_payable",
        direction: "credit",
        amountMinor: providerMinor,
        referenceType: "Payment",
        referenceId: paymentId,
        description: `Provider earnings for booking ${booking.bookingNo}`,
      },
    ];
    await tx.ledgerEntry.createMany({ data: rows });

    await tx.payment.update({
      where: { id: paymentId },
      data: { status: "succeeded", gatewayRef, paidAt: new Date() },
    });
    await tx.invoice.update({
      where: { id: invoice.id },
      data: { status: "paid", paidAt: new Date() },
    });
    await tx.booking.update({
      where: { id: booking.id },
      data: { status: "confirmed", confirmedAt: new Date() },
    });
  });
}

async function nextEntryNo(tx: any): Promise<number> {
  const last = await tx.ledgerEntry.findFirst({ orderBy: { entryNo: "desc" } });
  const num = last ? parseInt(last.entryNo.slice(3), 10) + 1 : 1;
  return num;
}

async function patientIdFor(userId: string): Promise<string | null> {
  const p = await prisma.patientProfile.findUnique({ where: { userId } });
  return p?.id ?? null;
}