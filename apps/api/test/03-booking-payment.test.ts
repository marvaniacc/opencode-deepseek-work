import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@wishubest/db";
import { getApp, api, onboardDoctor, createPatient, requestBooking, confirmBooking, payBooking, completeBooking, countLedgerEntries } from "./helpers";

describe("Test 6: booking request lifecycle", () => {
  beforeAll(async () => {
    await prisma.$executeRawUnsafe("TRUNCATE \"Booking\" CASCADE");
    await getApp();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("patient requests a booking with invoice", async () => {
    const doctor = await onboardDoctor("t6.doctor@test.local");
    const patientCookie = await createPatient("t6.patient@test.local");
    const { bookingId } = await requestBooking(patientCookie, doctor);
    expect(bookingId).toBeTruthy();

    const before = await prisma.booking.findUnique({ where: { id: bookingId } });
    expect(before?.status).toBe("requested");

    const confirmed = await confirmBooking(doctor.cookie, bookingId, { mode: "in_person" });
    const invoiceId = confirmed.invoice.id;
    expect(invoiceId).toBeTruthy();
    expect(confirmed.invoice.totalMinor).toBe(250000);
    const lineItems = await prisma.invoiceLineItem.findMany({ where: { invoiceId } });
    expect(lineItems).toHaveLength(2); // service + platform fee
    expect(lineItems.some((l) => l.unitPriceMinor === 250000)).toBe(true);
    expect(lineItems.some((l) => l.unitPriceMinor === 25000)).toBe(true); // 10% platform fee
  });

  it("provider rejects a booking", async () => {
    const doctor = await onboardDoctor("t6.doctor2@test.local");
    const patientCookie = await createPatient("t6.patient2@test.local");
    const { bookingId } = await requestBooking(patientCookie, doctor);
    const res = await api("POST", `/bookings/${bookingId}/reject`, {
      cookie: doctor.cookie,
      body: { reason: "not available" },
    });
    expect(res.statusCode).toBe(200);
    const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
    expect(booking?.status).toBe("rejected");
    expect(booking?.rejectedAt).toBeTruthy();
    expect(booking?.cancelledReason).toBe("not available");
  });
});

describe("Test 7: confirm + invoice + online meeting link", () => {
  it("requires a meeting link for online bookings", async () => {
    const doctor = await onboardDoctor("t7.doctor@test.local");
    const patientCookie = await createPatient("t7.patient@test.local");
    const { bookingId } = await requestBooking(patientCookie, doctor, { mode: "online" });
    const res = await api("POST", `/bookings/${bookingId}/confirm`, { cookie: doctor.cookie, body: {} });
    expect(res.statusCode).toBe(400);

    const ok = await confirmBooking(doctor.cookie, bookingId, { mode: "online" });
    expect(ok.booking.status).toBe("awaiting_payment");
    expect(ok.booking.meetingLink).toMatch(/^https:\/\//);
  });

  it("rejects invalid meeting links", async () => {
    const doctor = await onboardDoctor("t7.doctor2@test.local");
    const patientCookie = await createPatient("t7.patient2@test.local");
    const { bookingId } = await requestBooking(patientCookie, doctor, { mode: "online" });
    const res = await api("POST", `/bookings/${bookingId}/confirm`, {
      cookie: doctor.cookie,
      body: { meetingLink: "not-a-url" },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("Test 8: payment + ledger", () => {
  it("payment settles and creates 3 ledger entries", async () => {
    const doctor = await onboardDoctor("t8.doctor@test.local");
    const patientCookie = await createPatient("t8.patient@test.local");
    const { bookingId } = await requestBooking(patientCookie, doctor);
    await confirmBooking(doctor.cookie, bookingId, { mode: "in_person" });
    const pay = await payBooking(patientCookie, bookingId);
    expect(pay.payment.status).toBe("succeeded");
    expect(pay.idempotentReplay).toBe(false);

    const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
    expect(booking?.status).toBe("confirmed");

    const entries = await prisma.ledgerEntry.findMany({
      where: { referenceType: "Payment", referenceId: pay.payment.id },
      orderBy: { entryNo: "asc" },
    });
    expect(entries).toHaveLength(3);
    const codes = entries.map((e) => e.accountCode).sort();
    expect(codes).toEqual(["platform_fee", "platform_receivable", "provider_payable"]);
    const debitSum = entries.filter((e) => e.direction === "debit").reduce((s, e) => s + e.amountMinor, 0);
    const creditSum = entries.filter((e) => e.direction === "credit").reduce((s, e) => s + e.amountMinor, 0);
    expect(debitSum).toBe(creditSum); // double-entry balances
    expect(debitSum).toBe(250000);

    const providerPayable = entries.find((e) => e.accountCode === "provider_payable");
    expect(providerPayable?.amountMinor).toBe(225000); // 250000 - 10% platform fee
    const platformFee = entries.find((e) => e.accountCode === "platform_fee");
    expect(platformFee?.amountMinor).toBe(25000);
  });

  it("payments are idempotent — replay creates no duplicate ledger rows", async () => {
    const doctor = await onboardDoctor("t8.doctor2@test.local");
    const patientCookie = await createPatient("t8.patient2@test.local");
    const { bookingId } = await requestBooking(patientCookie, doctor);
    await confirmBooking(doctor.cookie, bookingId, { mode: "in_person" });
    const first = await payBooking(patientCookie, bookingId);
    const second = await api("POST", `/bookings/${bookingId}/pay`, { cookie: patientCookie });
    expect(second.json().idempotentReplay).toBe(true);
    expect(second.json().payment.id).toBe(first.payment.id);
    expect(await countLedgerEntries(first.payment.id)).toBe(3);

    const ledgerRows = await prisma.ledgerEntry.count({
      where: { referenceType: "Payment", referenceId: first.payment.id },
    });
    expect(ledgerRows).toBe(3);
  });
});

describe("Test 9: payment failure path", () => {
  it("failed webhook marks payment failed without booking confirmation", async () => {
    const doctor = await onboardDoctor("t9.doctor@test.local");
    const patientCookie = await createPatient("t9.patient@test.local");
    const { bookingId } = await requestBooking(patientCookie, doctor);
    await confirmBooking(doctor.cookie, bookingId, { mode: "in_person" });

    // Simulate a gateway-created pending payment, then a failing webhook.
    const confirmed = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: { invoice: true },
    });
    const payment = await prisma.payment.create({
      data: {
        invoiceId: confirmed!.invoice!.id,
        bookingId,
        amountMinor: confirmed!.invoice!.totalMinor,
        currencyCode: confirmed!.invoice!.currencyCode,
        method: "mock_card",
        status: "pending",
        idempotencyKey: `test:fail:${bookingId}`,
      },
    });

    const res = await api("POST", "/payments/webhook", {
      body: { paymentId: payment.id, event: "payment.failed", reason: "insufficient_funds" },
    });
    expect(res.statusCode).toBe(200);
    const updated = await prisma.payment.findUnique({ where: { id: payment.id } });
    expect(updated?.status).toBe("failed");
    expect(updated?.failureReason).toBe("insufficient_funds");
    const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
    expect(booking?.status).toBe("awaiting_payment"); // unchanged
  });
});

describe("Test 10: booking completion", () => {
  it("completes a confirmed booking", async () => {
    const doctor = await onboardDoctor("t10.doctor@test.local");
    const patientCookie = await createPatient("t10.patient@test.local");
    const { bookingId } = await requestBooking(patientCookie, doctor);
    await confirmBooking(doctor.cookie, bookingId, { mode: "in_person" });
    await payBooking(patientCookie, bookingId);
    const done = await completeBooking(doctor.cookie, bookingId);
    expect(done.booking.status).toBe("completed");
    expect(done.booking.completedAt).toBeTruthy();
  });
});