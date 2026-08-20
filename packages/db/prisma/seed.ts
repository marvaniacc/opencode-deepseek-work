import { PrismaClient, ProviderStatus, KycStatus, ServiceMode } from "../src/generated/client";
import bcrypt from "bcryptjs";
import crypto from "crypto";

const prisma = new PrismaClient();

// Match the API's DB_ENCRYPTION_KEY fallback so seeded API keys are decryptable.
const DB_KEY = process.env.DB_ENCRYPTION_KEY ?? process.env.JWT_SECRET ?? "dev-only-insecure-key";

function encryptSecret(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", crypto.createHash("sha256").update(DB_KEY).digest(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}.${tag.toString("base64")}.${enc.toString("base64")}`;
}

async function main() {
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? "admin@wishubest.local";
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? "Admin123!";

  const adminHash = await bcrypt.hash(adminPassword, 12);
  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      passwordHash: adminHash,
      role: "admin",
      locale: "fa",
      adminProfile: { create: { fullName: "Super Admin", superAdmin: true } },
    },
    include: { adminProfile: true },
  });

  // ---- Geo seed ----
  const iran = await prisma.country.upsert({
    where: { code: "IR" },
    update: {},
    create: { code: "IR", nameEn: "Iran", nameFa: "ایران", flag: "🇮🇷" },
  });
  const uae = await prisma.country.upsert({
    where: { code: "AE" },
    update: {},
    create: { code: "AE", nameEn: "United Arab Emirates", nameFa: "امارات متحده عربی", flag: "🇦🇪" },
  });

  const cities: Array<[string, string, string]> = [
    ["tehran", "Tehran", "تهران"],
    ["shiraz", "Shiraz", "شیراز"],
    ["dubai", "Dubai", "دبی"],
    ["abu-dhabi", "Abu Dhabi", "ابوظبی"],
  ];
  for (const [slug, en, fa] of cities) {
    const countryId = slug === "dubai" || slug === "abu-dhabi" ? uae.id : iran.id;
    await prisma.city.upsert({
      where: { countryId_slug: { countryId, slug } },
      update: {},
      create: { countryId, slug, nameEn: en, nameFa: fa },
    });
  }

  const usd = await prisma.currency.upsert({
    where: { code: "USD" },
    update: { isDefault: true, enabled: true },
    create: { code: "USD", name: "US Dollar", symbol: "$", isDefault: true, enabled: true },
  });

  // ---- Demo doctors ----
  const doctors: Array<{
    email: string;
    password: string;
    title: string;
    specialty: string;
    bio: string;
    citySlug: string;
    fee: number;
    online: boolean;
  }> = [
    {
      email: "doctor@wishubest.local",
      password: "Doctor123!",
      title: "Dr.",
      specialty: "Cardiologist",
      bio: "Specialist in interventional cardiology with 15 years of experience.",
      citySlug: "tehran",
      fee: 2500,
      online: true,
    },
    {
      email: "doctor2@wishubest.local",
      password: "Doctor123!",
      title: "Dr.",
      specialty: "Dermatologist",
      bio: "Expert in medical and cosmetic dermatology.",
      citySlug: "dubai",
      fee: 3000,
      online: true,
    },
  ];

  for (const d of doctors) {
    const user = await prisma.user.upsert({
      where: { email: d.email },
      update: {},
      create: {
        email: d.email,
        passwordHash: await bcrypt.hash(d.password, 12),
        role: "provider",
        locale: "fa",
      },
    });

    const profile = await prisma.providerProfile.upsert({
      where: { userId: user.id },
      update: { status: ProviderStatus.active, kycStatus: KycStatus.approved },
      create: {
        userId: user.id,
        providerType: "doctor",
        title: d.title,
        specialty: d.specialty,
        bio: d.bio,
        status: ProviderStatus.active,
        kycStatus: KycStatus.approved,
      },
    });

    const city = await prisma.city.findUniqueOrThrow({
      where: { countryId_slug: { countryId: d.citySlug === "dubai" ? uae.id : iran.id, slug: d.citySlug } },
    });

    const location = await prisma.providerLocation.upsert({
      where: { id: `seed-loc-${profile.id}` },
      update: {},
      create: {
        id: `seed-loc-${profile.id}`,
        providerId: profile.id,
        name: `${d.specialty} Clinic`,
        address: d.citySlug === "dubai" ? "Sheikh Zayed Road, Dubai" : "Valiasr Street, Tehran",
        countryId: city.countryId,
        cityId: city.id,
        isPrimary: true,
      },
    });

    await prisma.providerService.createMany({
      data: [
        {
          providerId: profile.id,
          serviceMode: ServiceMode.in_person,
          title: "In-person consultation",
          description: "Face-to-face consultation at the clinic.",
          priceMinor: d.fee * 100,
          currencyId: usd.id,
          durationMinutes: 30,
        },
        ...(d.online
          ? [
              {
                providerId: profile.id,
                serviceMode: ServiceMode.online,
                title: "Online video consultation",
                description: "Remote consultation via a third-party meeting link.",
                priceMinor: d.fee * 100,
                currencyId: usd.id,
                durationMinutes: 20,
              },
            ]
          : []),
      ],
      skipDuplicates: true,
    });
    void location;
  }

  // ---- Demo patient ----
  const patient = await prisma.user.upsert({
    where: { email: "patient@wishubest.local" },
    update: {},
    create: {
      email: "patient@wishubest.local",
      passwordHash: await bcrypt.hash("Patient123!", 12),
      role: "patient",
      locale: "fa",
      patientProfile: { create: { firstName: "Ali", lastName: "Rezaei", phone: "+98 912 000 0000" } },
    },
  });

  // ---- Default AI translation setting (mock provider so the demo works
  // without real API keys; admins can swap in openai/anthropic in the UI) ----
  await prisma.aiTranslationSetting.deleteMany({});
  await prisma.aiTranslationSetting.createMany({
    data: [
      {
        provider: "mock",
        apiKeyEncrypted: encryptSecret("mock"),
        modelName: "mock-translator",
        systemPrompt:
          "Translate the following text to {target_locale}. Return only the translation. Keep the medical/casual tone.",
        active: true,
      },
    ],
    skipDuplicates: true,
  });

  console.log("Seed complete.");
  console.log(`  Admin   : ${adminEmail} / ${adminPassword}`);
  console.log(`  Patient : patient@wishubest.local / Patient123!`);
  console.log("  Doctors : doctor@wishubest.local / doctor2@wishubest.local / Doctor123!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());