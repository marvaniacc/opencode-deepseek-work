import { FastifyInstance, LightMyRequestResponse } from "fastify";
import { prisma } from "@wishubest/db";
import { buildApp } from "../src/app";

let app: FastifyInstance | null = null;

export async function getApp(): Promise<FastifyInstance> {
  if (!app) {
    app = await buildApp();
  }
  return app;
}

export interface Call {
  statusCode: number;
  json: () => any;
  raw: string;
  headers: Record<string, string | string[] | undefined>;
}

export async function api(
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE",
  url: string,
  opts: { body?: unknown; cookie?: string; multipart?: { fields?: Record<string, string>; file?: { filename: string; contentType: string; content: Buffer } } } = {}
): Promise<Call> {
  const instance = await getApp();
  const headers: Record<string, string> = {};
  if (opts.cookie) headers.cookie = opts.cookie;
  let payload: unknown = opts.body === undefined ? undefined : JSON.stringify(opts.body);
  if (opts.multipart) {
    const boundary = `----vitest${Date.now()}`;
    const parts: Buffer[] = [];
    const push = (s: string) => parts.push(Buffer.from(s));
    const { fields, file } = opts.multipart;
    if (fields) {
      for (const [k, v] of Object.entries(fields)) {
        push(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`);
      }
    }
    if (file) {
      push(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${file.filename}"\r\n`);
      push(`Content-Type: ${file.contentType}\r\n\r\n`);
      parts.push(file.content);
      push("\r\n");
    }
    push(`--${boundary}--\r\n`);
    payload = Buffer.concat(parts);
    headers["content-type"] = `multipart/form-data; boundary=${boundary}`;
  } else if (opts.body !== undefined) {
    headers["content-type"] = "application/json";
  }
  const res = await instance.inject({
    method,
    url,
    headers,
    payload,
  });
  return {
    statusCode: res.statusCode,
    json: () => (res.body ? JSON.parse(res.body) : {}),
    raw: res.body ?? "",
    headers: res.headers as Record<string, string | string[] | undefined>,
  };
}

export async function registerUser(email: string, password = "Pass123!"): Promise<string> {
  const res = await api("POST", "/auth/register", {
    body: {
      email,
      password,
      role: "patient",
      profile: { firstName: email.split("@")[0], lastName: "Test" },
    },
  });
  if (res.statusCode !== 201) throw new Error(`register failed: ${JSON.stringify(res.json())}`);
  const setCookie = res.headers["set-cookie"];
  const cookie = (Array.isArray(setCookie) ? setCookie[0] : setCookie) ?? "";
  return cookie.split(";")[0];
}

export async function login(email: string, password: string): Promise<string> {
  const res = await api("POST", "/auth/login", { body: { email, password } });
  if (res.statusCode !== 200) throw new Error(`login failed: ${JSON.stringify(res.json())}`);
  const setCookie = res.headers["set-cookie"];
  const cookie = (Array.isArray(setCookie) ? setCookie[0] : setCookie) ?? "";
  return cookie.split(";")[0];
}

export async function resetDb(): Promise<void> {
  // Delete non-seeded users first (cascades to profiles, bookings, sessions,
  // notifications, etc.), keeping the seeded admin + geo + currency intact.
  await prisma.user.deleteMany({ where: { email: { not: "admin@wishubest.local" } } });
  const tables = [
    "AuditLog",
    "Notification",
    "ChatMessageTranslation",
    "ChatMessage",
    "ChatThread",
    "Review",
    "PaymentWebhookEvent",
    "LedgerEntry",
    "Payment",
    "InvoiceLineItem",
    "Invoice",
    "Booking",
    "MedicalDocumentAccessGrant",
    "PatientMedicalDocument",
    "ProviderService",
    "ProviderLocation",
    "ProviderKycDocument",
    "ProviderProfile",
    "PatientProfile",
    "Session",
    "AiTranslationSetting",
  ];
  await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t}"`).join(", ")} CASCADE`);
}

export async function getUserId(cookie: string): Promise<string> {
  const res = await api("GET", "/auth/me", { cookie });
  return res.json().user.id;
}

export interface OnboardedDoctor {
  cookie: string;
  providerId: string;
  doctorUserId: string;
  serviceIds: { inPerson: string; online: string };
  locationId: string;
}

export async function registerProvider(email: string, password = "Pass123!"): Promise<string> {
  const res = await api("POST", "/auth/register", {
    body: {
      email,
      password,
      role: "provider",
      profile: { title: "Dr. Test", specialty: "Cardiology" },
    },
  });
  if (res.statusCode !== 201) throw new Error(`provider register failed: ${JSON.stringify(res.json())}`);
  const setCookie = res.headers["set-cookie"];
  const cookie = (Array.isArray(setCookie) ? setCookie[0] : setCookie) ?? "";
  return cookie.split(";")[0];
}

export async function onboardDoctor(email: string, password = "Pass123!"): Promise<OnboardedDoctor> {
  const cookie = await registerProvider(email, password);
  const profile = await api("PUT", "/provider/profile", {
    cookie,
    body: { title: "Dr. Test", specialty: "Cardiology", bio: "Test cardiologist" },
  });
  if (profile.statusCode !== 200) throw new Error(`profile update failed: ${JSON.stringify(profile.json())}`);
  const providerId = profile.json().provider.id;

  const kyc = await api("POST", `/provider/kyc?kind=medical_license`, {
    cookie,
    multipart: {
      file: { filename: "license.pdf", contentType: "application/pdf", content: Buffer.from("KYC-DEMO") },
    },
  });
  if (kyc.statusCode !== 201) throw new Error(`kyc failed: ${JSON.stringify(kyc.json())}`);

  const adminCookie = await login("admin@wishubest.local", "Admin123!");
  const approve = await api("POST", `/admin/providers/${providerId}/kyc`, {
    cookie: adminCookie,
    body: { action: "approve" },
  });
  if (approve.statusCode !== 200) throw new Error(`kyc approve failed: ${JSON.stringify(approve.json())}`);

  const city = await prisma.city.findUniqueOrThrow({
    where: { countryId_slug: { countryId: (await prisma.country.findUniqueOrThrow({ where: { code: "IR" } })).id, slug: "tehran" } },
  });

  const loc = await api("POST", "/provider/locations", {
    cookie,
    body: { name: "Central Clinic", address: "Valiasr St", cityId: city.id, isPrimary: true },
  });
  if (loc.statusCode !== 201) throw new Error(`location failed: ${JSON.stringify(loc.json())}`);
  const locationId = loc.json().location.id;

  const s1 = await api("POST", "/provider/services", {
    cookie,
    body: { title: "In-person consultation", serviceMode: "in_person", priceMinor: 250000, durationMinutes: 30 },
  });
  const s2 = await api("POST", "/provider/services", {
    cookie,
    body: { title: "Video consultation", serviceMode: "online", priceMinor: 180000, durationMinutes: 20 },
  });
  if (s1.statusCode !== 201 || s2.statusCode !== 201) throw new Error(`service create failed`);

  return {
    cookie,
    providerId,
    doctorUserId: await getUserId(cookie),
    serviceIds: { inPerson: s1.json().service.id, online: s2.json().service.id },
    locationId,
  };
}

export async function createPatient(email: string, password = "Pass123!"): Promise<string> {
  return registerUser(email, password);
}

export interface BookingFlow {
  bookingId: string;
  invoiceId?: string;
  totalMinor?: number;
}

export async function requestBooking(patientCookie: string, doctor: OnboardedDoctor, opts: { mode?: "in_person" | "online" } = {}): Promise<BookingFlow> {
  const mode = opts.mode ?? "in_person";
  const serviceId = mode === "in_person" ? doctor.serviceIds.inPerson : doctor.serviceIds.online;
  const res = await api("POST", "/bookings", {
    cookie: patientCookie,
    body: {
      providerId: doctor.providerId,
      serviceId,
      ...(mode === "in_person" ? { locationId: doctor.locationId } : {}),
      scheduledFor: new Date(Date.now() + 86400000).toISOString(),
      patientNotes: "test booking",
    },
  });
  if (res.statusCode !== 201) throw new Error(`booking failed: ${JSON.stringify(res.json())}`);
  return { bookingId: res.json().booking.id };
}

export async function confirmBooking(doctorCookie: string, bookingId: string, opts: { mode?: "in_person" | "online" } = {}) {
  const res = await api("POST", `/bookings/${bookingId}/confirm`, {
    cookie: doctorCookie,
    body: { meetingLink: opts.mode === "online" ? "https://meet.example.com/x" : undefined },
  });
  if (res.statusCode !== 200) throw new Error(`confirm failed: ${JSON.stringify(res.json())}`);
  return res.json();
}

export async function payBooking(patientCookie: string, bookingId: string) {
  const res = await api("POST", `/bookings/${bookingId}/pay`, { cookie: patientCookie });
  if (res.statusCode !== 200) throw new Error(`pay failed: ${JSON.stringify(res.json())}`);
  return res.json();
}

export async function completeBooking(doctorCookie: string, bookingId: string) {
  const res = await api("POST", `/bookings/${bookingId}/complete`, { cookie: doctorCookie });
  if (res.statusCode !== 200) throw new Error(`complete failed: ${JSON.stringify(res.json())}`);
  return res.json();
}

export async function countLedgerEntries(paymentId: string): Promise<number> {
  return prisma.ledgerEntry.count({ where: { referenceType: "Payment", referenceId: paymentId } });
}
