import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@wishubest/db";
import { getApp, api, registerUser, login, createPatient, onboardDoctor } from "./helpers";

describe("Test 19: AI translation settings (admin only, encrypted)", () => {
  beforeAll(async () => {
    await prisma.$executeRawUnsafe("TRUNCATE \"AiTranslationSetting\" CASCADE");
    await getApp();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("only admins can manage AI settings", async () => {
    const patientCookie = await createPatient("t19.patient@test.local");
    const res = await api("GET", "/admin/ai-settings", { cookie: patientCookie });
    expect(res.statusCode).toBe(403);

    const doctor = await onboardDoctor("t19.doctor@test.local");
    const res2 = await api("GET", "/admin/ai-settings", { cookie: doctor.cookie });
    expect(res2.statusCode).toBe(403);
  });

  it("admin creates + activates a mock provider (no external call)", async () => {
    const adminCookie = await login("admin@wishubest.local", "Admin123!");
    const res = await api("POST", "/admin/ai-settings", {
      cookie: adminCookie,
      body: {
        provider: "mock",
        modelName: "mock-translator",
        systemPrompt: "Translate medical text",
        active: true,
        apiKey: "sk-test-1234",
      },
    });
    expect(res.statusCode).toBe(201);
    const setting = res.json().setting;
    expect(setting.provider).toBe("mock");
    expect(setting.active).toBe(true);
    // API key must be masked in responses
    expect(setting.apiKeyMasked).not.toContain("sk-test-1234");
    expect(setting.apiKey).toBeUndefined();

    // Must be stored encrypted, not plaintext
    const row = await prisma.aiTranslationSetting.findUnique({ where: { id: setting.id } });
    expect(row?.apiKeyEncrypted).not.toContain("sk-test-1234");

    // Activating a second setting should deactivate the first
    const res2 = await api("POST", "/admin/ai-settings", {
      cookie: adminCookie,
      body: { provider: "mock", modelName: "mock-translator", systemPrompt: "Translate medical text", active: true, apiKey: "sk-test-5678" },
    });
    expect(res2.statusCode).toBe(201);
    const active = await prisma.aiTranslationSetting.findMany({ where: { active: true } });
    expect(active).toHaveLength(1);
  });

  it("rejects creating a setting with an unknown provider", async () => {
    const adminCookie = await login("admin@wishubest.local", "Admin123!");
    const res = await api("POST", "/admin/ai-settings", {
      cookie: adminCookie,
      body: { provider: "nope", modelName: "x", systemPrompt: "p", apiKey: "k", active: false },
    });
    expect(res.statusCode).toBe(400);
  });

  it("test endpoint runs the active mock provider and works for admins only", async () => {
    const adminCookie = await login("admin@wishubest.local", "Admin123!");
    const setting = await prisma.aiTranslationSetting.findFirst({ where: { active: true } });
    expect(setting).toBeTruthy();

    const ok = await api("POST", `/admin/ai-settings/${setting!.id}/test`, { cookie: adminCookie });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().result.modelUsed).toBe("mock-translator");

    const patientCookie = await createPatient("t19.patient2@test.local");
    const forbidden = await api("POST", `/admin/ai-settings/${setting!.id}/test`, { cookie: patientCookie });
    expect(forbidden.statusCode).toBe(403);
  });
});

describe("Test 20: notifications", () => {
  it("booking lifecycle creates notifications for both parties", async () => {
    await prisma.$executeRawUnsafe("TRUNCATE \"Notification\" CASCADE");
    const doctor = await onboardDoctor("t20.doctor@test.local");
    const patientCookie = await createPatient("t20.patient@test.local");
    const doctorUserId = doctor.doctorUserId;
    const patientUserId = (await api("GET", "/auth/me", { cookie: patientCookie })).json().user.id;

    const { bookingId } = await (await import("./helpers")).requestBooking(patientCookie, doctor);
    await (await import("./helpers")).confirmBooking(doctor.cookie, bookingId, { mode: "in_person" });
    await (await import("./helpers")).payBooking(patientCookie, bookingId);

    const docN = await api("GET", "/notifications", { cookie: doctor.cookie });
    expect(docN.json().unread).toBeGreaterThan(0);
    const doctorNotifications = await prisma.notification.count({ where: { userId: doctorUserId } });
    expect(doctorNotifications).toBeGreaterThan(0);
    expect(docN.json().notifications.some((n: any) => n.type === "invoice_paid")).toBe(true);

    const patN = await api("GET", "/notifications", { cookie: patientCookie });
    const patientNotifications = await prisma.notification.count({ where: { userId: patientUserId } });
    expect(patientNotifications).toBeGreaterThan(0);
    expect(patN.json().notifications.some((n: any) => n.type === "booking_confirmed")).toBe(true);
  });

  it("marking a notification as read works only for its owner", async () => {
    await prisma.$executeRawUnsafe("TRUNCATE \"Notification\" CASCADE");
    const doctor = await onboardDoctor("t20.doctor2@test.local");
    const patientCookie = await createPatient("t20.patient2@test.local");

    const list = await api("GET", "/notifications", { cookie: doctor.cookie });
    expect(list.json().notifications.length).toBe(0);

    // Create a notification via booking flow to the doctor
    const { bookingId } = await (await import("./helpers")).requestBooking(patientCookie, doctor);
    await (await import("./helpers")).confirmBooking(doctor.cookie, bookingId, { mode: "in_person" });

    const docList = await api("GET", "/notifications", { cookie: doctor.cookie });
    const nid = docList.json().notifications[0].id;
    expect(docList.json().unread).toBe(1);

    // patient cannot mark doctor's notification
    const forbidden = await api("POST", `/notifications/${nid}/read`, { cookie: patientCookie });
    expect(forbidden.statusCode).toBe(403);

    const read = await api("POST", `/notifications/${nid}/read`, { cookie: doctor.cookie });
    expect(read.statusCode).toBe(200);

    const after = await api("GET", "/notifications", { cookie: doctor.cookie });
    expect(after.json().unread).toBe(0);
  });
});