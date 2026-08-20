import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@wishubest/db";
import { getApp, api, onboardDoctor, createPatient, requestBooking, confirmBooking, payBooking, completeBooking } from "./helpers";

describe("Test 10b: reviews", () => {
  beforeAll(async () => {
    await prisma.$executeRawUnsafe("TRUNCATE \"Review\" CASCADE");
    await getApp();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("patient reviews a completed booking once", async () => {
    const doctor = await onboardDoctor("t10r.doctor@test.local");
    const patientCookie = await createPatient("t10r.patient@test.local");
    const { bookingId } = await requestBooking(patientCookie, doctor);
    await confirmBooking(doctor.cookie, bookingId, { mode: "in_person" });
    await payBooking(patientCookie, bookingId);
    await completeBooking(doctor.cookie, bookingId);

    const res = await api("POST", "/reviews", {
      cookie: patientCookie,
      body: { bookingId, rating: 5, comment: "great" },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().review.isVerified).toBe(true);

    const dup = await api("POST", "/reviews", { cookie: patientCookie, body: { bookingId, rating: 3 } });
    expect(dup.statusCode).toBe(409);
  });

  it("cannot review a non-completed booking", async () => {
    const doctor = await onboardDoctor("t10r.doctor2@test.local");
    const patientCookie = await createPatient("t10r.patient2@test.local");
    const { bookingId } = await requestBooking(patientCookie, doctor);
    const res = await api("POST", "/reviews", { cookie: patientCookie, body: { bookingId, rating: 4 } });
    expect(res.statusCode).toBe(404);
  });
});

describe("Test 11: review moderation", () => {
  it("reviews stay hidden until admin approval, then become public", async () => {
    const doctor = await onboardDoctor("t11.doctor@test.local");
    const patientCookie = await createPatient("t11.patient@test.local");
    const { bookingId } = await requestBooking(patientCookie, doctor);
    await confirmBooking(doctor.cookie, bookingId, { mode: "in_person" });
    await payBooking(patientCookie, bookingId);
    await completeBooking(doctor.cookie, bookingId);
    await api("POST", "/reviews", { cookie: patientCookie, body: { bookingId, rating: 4, comment: "nice" } });

    const pubBefore = await api("GET", `/providers/${doctor.providerId}/reviews`);
    expect(pubBefore.json().reviews).toHaveLength(0);

    const adminCookie = await (await import("./helpers")).login("admin@wishubest.local", "Admin123!");
    const queue = await api("GET", "/admin/reviews?status=pending", { cookie: adminCookie });
    const review = queue.json().reviews[0];
    expect(review).toBeTruthy();
    const approve = await api("PATCH", `/admin/reviews/${review.id}`, { cookie: adminCookie, body: { status: "approved" } });
    expect(approve.statusCode).toBe(200);

    const pubAfter = await api("GET", `/providers/${doctor.providerId}/reviews`);
    expect(pubAfter.json().reviews).toHaveLength(1);
    expect(pubAfter.json().reviews[0].rating).toBe(4);
  });
});