import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@wishubest/db";
import { getApp, api, registerUser, login, resetDb } from "./helpers";

describe("Test 1: authentication lifecycle", () => {
  beforeAll(async () => {
    await resetDb();
    await getApp();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("registers a patient and sets an httpOnly cookie", async () => {
    const res = await api("POST", "/auth/register", {
      body: { email: "t1.patient@test.local", password: "Pass123!", role: "patient", profile: { firstName: "T1", lastName: "Patient" } },
    });
    expect(res.statusCode).toBe(201);
    const cookie = (Array.isArray(res.headers["set-cookie"]) ? res.headers["set-cookie"][0] : res.headers["set-cookie"]) ?? "";
    expect(cookie).toContain("wishubest_session");
    expect(cookie).toContain("HttpOnly");
  });

  it("rejects registering as admin", async () => {
    const res = await api("POST", "/auth/register", { body: { email: "t1.admin@test.local", password: "Pass123!", role: "admin" } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("role_must_be_patient_or_provider");
  });

  it("logs in and /auth/me returns the user", async () => {
    const cookie = await login("t1.patient@test.local", "Pass123!");
    const me = await api("GET", "/auth/me", { cookie });
    expect(me.statusCode).toBe(200);
    expect(me.json().user.email).toBe("t1.patient@test.local");
    expect(me.json().user.role).toBe("patient");
  });

  it("logout revokes the session", async () => {
    const cookie = await login("t1.patient@test.local", "Pass123!");
    const out = await api("POST", "/auth/logout", { cookie });
    expect(out.statusCode).toBe(200);
    const me = await api("GET", "/auth/me", { cookie });
    expect(me.statusCode).toBe(401);
  });

  it("rejects invalid credentials", async () => {
    const res = await api("POST", "/auth/login", { body: { email: "t1.patient@test.local", password: "Wrongpass!1" } });
    expect(res.statusCode).toBe(401);
  });
});

describe("Test 2: role-based access control", () => {
  it("blocks unauthenticated access to dashboard APIs", async () => {
    const res = await api("GET", "/auth/me");
    expect(res.statusCode).toBe(401);
  });

  it("blocks patient from admin routes", async () => {
    const cookie = await registerUser("t2.patient@test.local");
    const res = await api("GET", "/admin/users", { cookie });
    expect(res.statusCode).toBe(403);
  });

  it("blocks patient from provider routes", async () => {
    const cookie = await registerUser("t2.patient2@test.local");
    const res = await api("GET", "/provider/profile", { cookie });
    expect(res.statusCode).toBe(403);
  });

  it("blocks provider from patient routes", async () => {
    const cookie = await (await import("./helpers")).registerProvider("t2.doc@test.local");
    const res = await api("POST", "/documents/upload", {
      cookie,
      multipart: { file: { filename: "x.pdf", contentType: "application/pdf", content: Buffer.from("x") } },
    });
    expect(res.statusCode).toBe(403);
  });

  it("allows admin to access admin routes", async () => {
    const adminCookie = await login("admin@wishubest.local", "Admin123!");
    const res = await api("GET", "/admin/users", { cookie: adminCookie });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.json().users)).toBe(true);
  });
});