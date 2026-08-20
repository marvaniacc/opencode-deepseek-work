import { execSync } from "child_process";
import { PrismaClient } from "@wishubest/db";

const DB = process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/wishubest_test";

export default async function globalSetup() {
  execSync("prisma migrate deploy", {
    cwd: new URL("../../../packages/db", import.meta.url).pathname,
    env: {
      ...process.env,
      DATABASE_URL: DB,
    },
    stdio: "inherit",
  });

  execSync("tsx prisma/seed.ts", {
    cwd: new URL("../../../packages/db", import.meta.url).pathname,
    env: {
      ...process.env,
      DATABASE_URL: DB,
      DB_ENCRYPTION_KEY: "test-encryption-key-0123456789abcdef0123456789",
      JWT_SECRET: "test-secret-0123456789abcdef0123456789abcdef",
      PATH: `${process.env.PATH}:${new URL("../../../node_modules/.bin", import.meta.url).pathname}`,
    },
    stdio: "inherit",
  });

  // Wipe everything except the seeded admin/geo/currency so every run starts
  // from a clean slate.
  process.env.DATABASE_URL = DB;
  const prisma = new PrismaClient();
  await prisma.user.deleteMany({ where: { email: { not: "admin@wishubest.local" } } });
  const tables = [
    "AuditLog", "Notification", "ChatMessageTranslation", "ChatMessage", "ChatThread",
    "Review", "PaymentWebhookEvent", "LedgerEntry", "Payment", "InvoiceLineItem",
    "Invoice", "Booking", "MedicalDocumentAccessGrant", "PatientMedicalDocument",
    "ProviderService", "ProviderLocation", "ProviderKycDocument", "ProviderProfile",
    "PatientProfile", "Session", "AiTranslationSetting",
  ];
  await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t}"`).join(", ")} CASCADE`);
  await prisma.$disconnect();
}
