import { FastifyInstance, FastifyRequest } from "fastify";
import { prisma } from "@wishubest/db";
import { notFound } from "../../lib/httpError";

// Public, unauthenticated marketplace endpoints (MVP: doctors only).

export async function registerMarketplaceRoutes(app: FastifyInstance) {
  // GET /public/marketplace — homepage data
  app.get("/public/marketplace", async () => {
    const [featured, countries, doctorsCount] = await Promise.all([
      prisma.providerProfile.findMany({
        where: { providerType: "doctor", status: "active", kycStatus: "approved" },
        take: 6,
        orderBy: { updatedAt: "desc" },
        include: {
          user: true,
          services: { where: { isActive: true }, include: { currency: true }, take: 2 },
          locations: { include: { city: true }, take: 1 },
          reviews: { where: { status: "approved" }, select: { rating: true }, take: 100 },
        },
      }),
      prisma.country.findMany({
        where: { isActive: true },
        include: { cities: { where: { isActive: true } } },
        orderBy: { code: "asc" },
      }),
      prisma.providerProfile.count({ where: { providerType: "doctor", status: "active" } }),
    ]);

    return {
      doctorsCount,
      featured: featured.map((p) => serializeDoctor(p)),
      countries: countries.map((c) => ({
        id: c.id,
        code: c.code,
        nameEn: c.nameEn,
        nameFa: c.nameFa,
        flag: c.flag,
        cities: c.cities.map((city) => ({ id: city.id, nameEn: city.nameEn, nameFa: city.nameFa, slug: city.slug })),
      })),
    };
  });

  // GET /public/doctors?country=&city=&q=&serviceMode=&page=
  app.get("/public/doctors", async (request) => {
    const { country, city, q, serviceMode, page = "1", pageSize = "12" } = request.query as any;

    const where: any = {
      providerType: "doctor",
      status: "active",
      kycStatus: "approved",
      services: { some: { isActive: true } },
    };
    if (serviceMode === "in_person" || serviceMode === "online") {
      where.services = { some: { isActive: true, serviceMode } };
    }
    if (country) where.locations = { some: { city: { country: { code: country } } } };
    if (city) where.locations = { some: { city: { slug: city } } };
    if (q) {
      where.OR = [
        { specialty: { contains: q, mode: "insensitive" } },
        { bio: { contains: q, mode: "insensitive" } },
        { title: { contains: q, mode: "insensitive" } },
      ];
    }

    const total = await prisma.providerProfile.count({ where });
    const providers = await prisma.providerProfile.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip: (parseInt(page, 10) - 1) * parseInt(pageSize, 10),
      take: parseInt(pageSize, 10),
      include: {
        services: { where: { isActive: true }, include: { currency: true }, orderBy: { priceMinor: "asc" } },
        locations: { include: { city: true }, take: 1 },
        reviews: { where: { status: "approved" }, select: { rating: true }, take: 100 },
      },
    });

    return {
      total,
      page: parseInt(page, 10),
      pageSize: parseInt(pageSize, 10),
      doctors: providers.map((p) => serializeDoctor(p)),
    };
  });

  // GET /public/doctors/:id — full detail
  app.get("/public/doctors/:id", async (request) => {
    const { id } = request.params as { id: string };
    const provider = await prisma.providerProfile.findFirst({
      where: { id, providerType: "doctor", status: "active", kycStatus: "approved" },
      include: {
        user: true,
        services: { where: { isActive: true }, include: { currency: true }, orderBy: { priceMinor: "asc" } },
        locations: { include: { city: { include: { country: true } } } },
        reviews: { where: { status: "approved" }, include: { patient: { select: { firstName: true, lastName: true } } }, orderBy: { createdAt: "desc" }, take: 50 },
      },
    });
    if (!provider) throw notFound("doctor_not_found");

    const reviews = provider.reviews;
    const avgRating = reviews.length
      ? Math.round((reviews.reduce((s, r) => s + r.rating, 0) / reviews.length) * 10) / 10
      : null;

    return {
      doctor: serializeDoctor(provider),
      avgRating,
      reviewCount: reviews.length,
      reviews: reviews.map((r) => ({
        id: r.id,
        rating: r.rating,
        comment: r.comment,
        patientName: r.isVerified ? `${r.patient.firstName} ${r.patient.lastName}` : "Verified patient",
        isVerified: r.isVerified,
        createdAt: r.createdAt,
      })),
    };
  });
}

function serializeDoctor(p: any) {
  const services = p.services ?? [];
  const minPrice = services.length
    ? Math.min(...services.map((s: any) => s.priceMinor))
    : null;
  const locations = p.locations ?? [];
  const reviews = p.reviews ?? [];
  const avgRating = reviews.length
    ? Math.round((reviews.reduce((s: number, r: any) => s + r.rating, 0) / reviews.length) * 10) / 10
    : null;

  return {
    id: p.id,
    userId: p.userId,
    title: p.title,
    specialty: p.specialty,
    bio: p.bio,
    verifiedAt: p.verifiedAt,
    hasOnline: services.some((s: any) => s.serviceMode === "online"),
    hasInPerson: services.some((s: any) => s.serviceMode === "in_person"),
    minPriceMinor: minPrice,
    currencyCode: services[0]?.currency?.code ?? null,
    services: services.map((s: any) => ({
      id: s.id,
      serviceMode: s.serviceMode,
      title: s.title,
      description: s.description,
      priceMinor: s.priceMinor,
      currencyCode: s.currency?.code ?? null,
      durationMinutes: s.durationMinutes,
    })),
    locations: locations.map((l: any) => ({
      id: l.id,
      name: l.name,
      address: l.address,
      isPrimary: l.isPrimary,
      city: l.city ? { id: l.city.id, nameEn: l.city.nameEn, nameFa: l.city.nameFa } : null,
    })),
    avgRating,
    reviewCount: reviews.length,
  };
}