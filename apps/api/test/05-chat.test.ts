import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@wishubest/db";
import { getApp, api, onboardDoctor, createPatient, login } from "./helpers";

describe("Test 12: chat threads and messages", () => {
  beforeAll(async () => {
    await prisma.$executeRawUnsafe("TRUNCATE \"ChatMessage\" CASCADE");
    await getApp();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("patient starts a thread with a doctor and messages flow", async () => {
    const doctor = await onboardDoctor("t12.doctor@test.local");
    const patientCookie = await createPatient("t12.patient@test.local");
    const patientId = (await api("GET", "/auth/me", { cookie: patientCookie })).json().user.id;

    const thread = await api("POST", "/chat/threads", { cookie: patientCookie, body: { providerId: doctor.providerId } });
    expect(thread.statusCode).toBe(201);
    const threadId = thread.json().thread.id;

    const send = await api("POST", `/chat/threads/${threadId}/messages`, { cookie: patientCookie, body: { text: "سلام دکتر" } });
    expect(send.statusCode).toBe(201);

    const msgs = await api("GET", `/chat/threads/${threadId}/messages`, { cookie: doctor.cookie });
    expect(msgs.json().messages).toHaveLength(1);
    expect(msgs.json().messages[0].senderId).toBe(patientId);
    expect(msgs.json().messages[0].originalText).toBe("سلام دکتر");
  });

  it("provider replies and patient sees it via polling endpoint", async () => {
    const doctor = await onboardDoctor("t12.doctor2@test.local");
    const patientCookie = await createPatient("t12.patient2@test.local");
    const thread = await api("POST", "/chat/threads", { cookie: patientCookie, body: { providerId: doctor.providerId } });
    const threadId = thread.json().thread.id;
    await api("POST", `/chat/threads/${threadId}/messages`, { cookie: patientCookie, body: { text: "سلام" } });

    await api("POST", `/chat/threads/${threadId}/messages`, { cookie: doctor.cookie, body: { text: "بله بفرمایید" } });

    const after = await api("GET", `/chat/threads/${threadId}/messages?after=${encodeURIComponent((await api("GET", `/chat/threads/${threadId}/messages`, { cookie: patientCookie })).json().messages[0].createdAt)}`, { cookie: patientCookie });
    expect(after.json().messages.length).toBeGreaterThanOrEqual(1);
  });

  it("threads list shows only the participant's threads", async () => {
    const doctor = await onboardDoctor("t12.doctor3@test.local");
    const patientCookie = await createPatient("t12.patient3@test.local");
    await api("POST", "/chat/threads", { cookie: patientCookie, body: { providerId: doctor.providerId } });

    const list = await api("GET", "/chat/threads", { cookie: patientCookie });
    expect(list.json().threads.every((t: any) => t.otherParty.id === doctor.providerId)).toBe(true);
  });
});

describe("Test 13: AI translation — cache once", () => {
  beforeAll(async () => {
    await prisma.$executeRawUnsafe("TRUNCATE \"ChatMessageTranslation\" CASCADE");
    await getApp();
    // Ensure a mock provider is active so translations work without external calls.
    const { login } = await import("./helpers");
    const adminCookie = await login("admin@wishubest.local", "Admin123!");
    await api("POST", "/admin/ai-settings", {
      cookie: adminCookie,
      body: { provider: "mock", modelName: "mock-translator", systemPrompt: "Translate", active: true, apiKey: "sk-test" },
    });
  });

  it("translates another party's message and caches the result", async () => {
    const doctor = await onboardDoctor("t13.doctor@test.local");
    const patientCookie = await createPatient("t13.patient@test.local");
    const thread = await api("POST", "/chat/threads", { cookie: patientCookie, body: { providerId: doctor.providerId } });
    const threadId = thread.json().thread.id;
    await api("POST", `/chat/threads/${threadId}/messages`, { cookie: patientCookie, body: { text: "قلبم درد میکند" } });
    const msg = (await api("GET", `/chat/threads/${threadId}/messages`, { cookie: doctor.cookie })).json().messages[0];

    const first = await api("POST", `/chat/messages/${msg.id}/translate`, { cookie: doctor.cookie, body: { targetLocale: "en" } });
    expect(first.statusCode).toBe(200);
    expect(first.json().translation.cached).toBe(false);
    expect(first.json().translation.translatedText).toContain("[en]");
    expect(first.json().translation.translatedText).toContain("قلبم");

    const second = await api("POST", `/chat/messages/${msg.id}/translate`, { cookie: doctor.cookie, body: { targetLocale: "en" } });
    expect(second.json().translation.cached).toBe(true);
    expect(second.json().translation.translatedText).toBe(first.json().translation.translatedText);

    const rows = await prisma.chatMessageTranslation.count({
      where: { messageId: msg.id, targetLocale: "en" },
    });
    expect(rows).toBe(1); // one AI call only, cached
  });

  it("forbids translating your own message", async () => {
    const doctor = await onboardDoctor("t13.doctor2@test.local");
    const patientCookie = await createPatient("t13.patient2@test.local");
    const thread = await api("POST", "/chat/threads", { cookie: patientCookie, body: { providerId: doctor.providerId } });
    const threadId = thread.json().thread.id;
    await api("POST", `/chat/threads/${threadId}/messages`, { cookie: doctor.cookie, body: { text: "بله" } });
    const msg = (await api("GET", `/chat/threads/${threadId}/messages`, { cookie: doctor.cookie })).json().messages[0];
    const res = await api("POST", `/chat/messages/${msg.id}/translate`, { cookie: doctor.cookie, body: { targetLocale: "en" } });
    expect(res.statusCode).toBe(403);
  });

  it("translation stores per-locale rows", async () => {
    const doctor = await onboardDoctor("t13.doctor3@test.local");
    const patientCookie = await createPatient("t13.patient3@test.local");
    const thread = await api("POST", "/chat/threads", { cookie: patientCookie, body: { providerId: doctor.providerId } });
    const threadId = thread.json().thread.id;
    await api("POST", `/chat/threads/${threadId}/messages`, { cookie: patientCookie, body: { text: "متشکرم" } });
    const msg = (await api("GET", `/chat/threads/${threadId}/messages`, { cookie: doctor.cookie })).json().messages[0];

    await api("POST", `/chat/messages/${msg.id}/translate`, { cookie: doctor.cookie, body: { targetLocale: "fa" } });
    await api("POST", `/chat/messages/${msg.id}/translate`, { cookie: doctor.cookie, body: { targetLocale: "en" } });
    const rows = await prisma.chatMessageTranslation.findMany({ where: { messageId: msg.id } });
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((r) => r.targetLocale))).toEqual(new Set(["fa", "en"]));
  });
});