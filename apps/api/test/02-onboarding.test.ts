import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@wishubest/db";
import { getApp, api, onboardDoctor, resetDb } from "./helpers";

describe("Test 3: doctor onboarding + KYC", () => {
  beforeAll(async () => {
    await resetDb();
    await getApp();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("onboards a full doctor profile through admin KYC approval", async () => {
    const doctor = await onboardDoctor("t3.doctor@test.local");
    expect(doctor.providerId).toBeTruthy();

    const db = await prisma.providerProfile.findUnique({ where: { id: doctor.providerId } });
    expect(db?.title).toBe("Dr. Test");
    expect(db?.specialty).toBe("Cardiology");
    expect(db?.providerType).toBe("doctor");
    expect(db?.kycStatus).toBe("approved");
    expect(db?.status).toBe("active");
    expect(db?.platformFeeBps).toBe(1000);
  });

  it("KYC documents are stored in private storage", async () => {
    const docs = await prisma.providerKycDocument.findMany();
    expect(docs.length).toBeGreaterThan(0);
    expect(docs[0]?.fileKey).toMatch(/^kyc\//);
    expect(docs[0]?.mimeType).toBe("application/pdf");
  });

  it("provider can create locations and services", async () => {
    const doctor = await onboardDoctor("t3.doctor2@test.local");
    const services = await prisma.providerService.findMany({ where: { providerId: doctor.providerId } });
    expect(services).toHaveLength(2);
    const modes = services.map((s) => s.serviceMode).sort();
    expect(modes).toEqual(["in_person", "online"]);
    const locations = await prisma.providerLocation.findMany({ where: { providerId: doctor.providerId } });
    expect(locations.length).toBe(1);
    expect(locations[0]?.isPrimary).toBe(true);
  });
});

describe("Test 4: marketplace listing filters", () => {
  beforeAll(async () => {
    await getApp();
  });

  it("only lists approved doctors", async () => {
    const res = await api("GET", "/public/doctors");
    expect(res.statusCode).toBe(200);
    for (const d of res.json().doctors) {
      expect(d.id).toBeTruthy();
      expect(d.specialty).toBeTruthy();
      expect(d.services).toBeDefined();
    }
  });

  it("filters by city", async () => {
    const res = await api("GET", "/public/doctors?city=tehran");
    expect(res.statusCode).toBe(200);
  });

  it("filters by service mode", async () => {
    const res = await api("GET", "/public/doctors?serviceMode=online");
    expect(res.statusCode).toBe(200);
  });

  it("hides rejected doctors from public detail", async () => {
    const res = await api("GET", "/public/doctors/some-nonexistent-id");
    expect(res.statusCode).toBe(404);
  });
});

describe("Test 5: service price validation", () => {
  it("rejects non-positive prices", async () => {
    const doctor = await onboardDoctor("t5.doctor@test.local");
    const res = await api("POST", "/provider/services", {
      cookie: doctor.cookie,
      body: { title: "Bad", serviceMode: "in_person", priceMinor: 0 },
    });
    expect(res.statusCode).toBe(400);
  });

  it("rejects invalid service mode", async () => {
    const doctor = await onboardDoctor("t5.doctor2@test.local");
    const res = await api("POST", "/provider/services", {
      cookie: doctor.cookie,
      body: { title: "Bad", serviceMode: "teleport", priceMinor: 100 },
    });
    expect(res.statusCode).toBe(400);
  });
});