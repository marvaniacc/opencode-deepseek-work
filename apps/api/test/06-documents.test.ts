import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@wishubest/db";
import { getApp, api, onboardDoctor, createPatient, login } from "./helpers";

describe("Test 15: document upload + grant", () => {
  beforeAll(async () => {
    await prisma.$executeRawUnsafe("TRUNCATE \"PatientMedicalDocument\" CASCADE");
    await getApp();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("patient uploads a medical document", async () => {
    const patientCookie = await createPatient("t15.patient@test.local");
    const res = await api("POST", "/documents/upload", {
      cookie: patientCookie,
      multipart: {
        fields: { title: "Lab Report" },
        file: { filename: "lab.pdf", contentType: "application/pdf", content: Buffer.from("LAB-DATA") },
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().document.originalFilename).toBe("lab.pdf");
    expect(res.json().document.status).toBe("active");
  });

  it("rejects unsupported file types", async () => {
    const patientCookie = await createPatient("t15.patient2@test.local");
    const res = await api("POST", "/documents/upload", {
      cookie: patientCookie,
      multipart: {
        file: { filename: "virus.exe", contentType: "application/x-msdownload", content: Buffer.from("x") },
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it("patient grants access to a doctor", async () => {
    const doctor = await onboardDoctor("t15.doctor@test.local");
    const patientCookie = await createPatient("t15.patient3@test.local");
    const res = await api("POST", "/documents/grants", {
      cookie: patientCookie,
      body: { providerId: doctor.providerId },
    });
    expect(res.statusCode).toBe(200);
    const grants = await api("GET", "/documents/grants", { cookie: patientCookie });
    expect(grants.json().grants.some((g: any) => g.providerId === doctor.providerId && g.active)).toBe(true);
  });
});

describe("Test 16: signed download tickets", () => {
  it("provider with grant + booking downloads via ticket", async () => {
    const doctor = await onboardDoctor("t16.doctor@test.local");
    const patientCookie = await createPatient("t16.patient@test.local");
    await api("POST", "/documents/grants", { cookie: patientCookie, body: { providerId: doctor.providerId } });

    const up = await api("POST", "/documents/upload", {
      cookie: patientCookie,
      multipart: { file: { filename: "a.pdf", contentType: "application/pdf", content: Buffer.from("DOC") } },
    });
    const docId = up.json().document.id;

    // Provider needs a booking/thread relation with the patient to be relevant.
    const thread = await api("POST", "/chat/threads", { cookie: patientCookie, body: { providerId: doctor.providerId } });
    expect(thread.statusCode).toBe(201);

    const ticket = await api("POST", `/documents/${docId}/download`, { cookie: doctor.cookie });
    expect(ticket.statusCode).toBe(200);
    const download = await api("GET", ticket.json().downloadUrl, { cookie: doctor.cookie });
    expect(download.statusCode).toBe(200);
    expect(download.raw).toBe("DOC");
  });

  it("tampered ticket is rejected", async () => {
    const doctor = await onboardDoctor("t16.doctor2@test.local");
    const patientCookie = await createPatient("t16.patient2@test.local");
    await api("POST", "/documents/grants", { cookie: patientCookie, body: { providerId: doctor.providerId } });
    const up = await api("POST", "/documents/upload", {
      cookie: patientCookie,
      multipart: { file: { filename: "b.pdf", contentType: "application/pdf", content: Buffer.from("DOC") } },
    });
    await api("POST", "/chat/threads", { cookie: patientCookie, body: { providerId: doctor.providerId } });
    const ticket = await api("POST", `/documents/${up.json().document.id}/download`, { cookie: doctor.cookie });
    const bad = ticket.json().downloadUrl.slice(0, -1) + "x";
    const res = await api("GET", bad, { cookie: doctor.cookie });
    expect(res.statusCode).toBe(403);
  });
});

describe("Test 17: revoked grant revokes existing tickets", () => {
  it("a valid ticket cannot be used after the grant is revoked", async () => {
    const doctor = await onboardDoctor("t17.doctor@test.local");
    const patientCookie = await createPatient("t17.patient@test.local");
    await api("POST", "/documents/grants", { cookie: patientCookie, body: { providerId: doctor.providerId } });
    const up = await api("POST", "/documents/upload", {
      cookie: patientCookie,
      multipart: { file: { filename: "c.pdf", contentType: "application/pdf", content: Buffer.from("DOC") } },
    });
    await api("POST", "/chat/threads", { cookie: patientCookie, body: { providerId: doctor.providerId } });

    const ticket = await api("POST", `/documents/${up.json().document.id}/download`, { cookie: doctor.cookie });
    expect(ticket.statusCode).toBe(200);

    const revoke = await api("POST", `/documents/grants/${doctor.providerId}/revoke`, { cookie: patientCookie });
    expect(revoke.statusCode).toBe(200);

    // The ticket is still cryptographically valid but the access check must fail.
    const res = await api("GET", ticket.json().downloadUrl, { cookie: doctor.cookie });
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe("no_access_to_document");
  });
});

describe("Test 18: provider only sees relevant patients", () => {
  it("provider without booking or thread cannot see or download documents", async () => {
    const doctor = await onboardDoctor("t18.doctor@test.local");
    const patientCookie = await createPatient("t18.patient@test.local");
    await api("POST", "/documents/grants", { cookie: patientCookie, body: { providerId: doctor.providerId } });
    const up = await api("POST", "/documents/upload", {
      cookie: patientCookie,
      multipart: { file: { filename: "d.pdf", contentType: "application/pdf", content: Buffer.from("DOC") } },
    });

    const patients = await api("GET", "/provider/documents/patients", { cookie: doctor.cookie });
    expect(patients.json().patients).toHaveLength(0);

    const res = await api("POST", `/documents/${up.json().document.id}/download`, { cookie: doctor.cookie });
    expect(res.statusCode).toBe(403);
  });
});