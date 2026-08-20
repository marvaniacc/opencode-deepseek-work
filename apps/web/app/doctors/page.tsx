import Link from "next/link";
import { cookies } from "next/headers";
import { api } from "@/lib/api";
import { DoctorCard } from "@/components/DoctorCard";
import { AppLogo, Input, Select, Button, Icon, EmptyState } from "@wishubest/ui";
import { LocaleSwitcher } from "@/components/LocaleSwitcher";

export const dynamic = "force-dynamic";

export default async function DoctorsPage({
  searchParams,
}: {
  searchParams: Promise<{ country?: string; city?: string; q?: string; serviceMode?: string }>;
}) {
  const store = await cookies();
  const locale = (store.get("locale")?.value ?? "fa") as "fa" | "en";
  const t = (fa: string, en: string) => (locale === "fa" ? fa : en);
  const params = await searchParams;

  const qs = new URLSearchParams();
  if (params.country) qs.set("country", params.country);
  if (params.city) qs.set("city", params.city);
  if (params.q) qs.set("q", params.q);
  if (params.serviceMode) qs.set("serviceMode", params.serviceMode);

  let data: any = { doctors: [], total: 0, countries: [] };
  try {
    const [listing, marketplace] = await Promise.all([
      api.get(`/public/doctors?${qs.toString()}`, { withAuth: false }),
      api.get("/public/marketplace", { withAuth: false }),
    ]);
    data = { ...listing, countries: marketplace.countries };
  } catch {
    // fall back to empty
  }

  const selectedCountry = params.country ?? "";
  const selectedCity = params.city ?? "";
  const selectedMode = params.serviceMode ?? "";
  const selectedCountryData = data.countries.find((c: any) => c.code === selectedCountry);
  const activeFilter =
    selectedCountry || selectedCity || params.q || selectedMode ? true : false;

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <header className="sticky top-0 z-20 border-b border-[var(--border)] bg-[var(--bg)]/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 md:px-8">
          <Link href="/">
            <AppLogo />
          </Link>
          <div className="flex items-center gap-2">
            <LocaleSwitcher locale={locale} />
            <Link href="/auth/login" className="hidden md:block">
              <Button size="sm" variant="secondary">
                {t("ورود", "Sign in")}
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-10 md:px-8">
        <h1 className="mb-6 text-2xl font-semibold tracking-tight text-[var(--fg)]">
          {t("پزشکان", "Doctors")}
        </h1>

        {/* Filters */}
        <form method="GET" action="/doctors" className="mb-8 grid gap-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-muted)] p-4 sm:grid-cols-2 lg:grid-cols-4">
          <Input
            name="q"
            defaultValue={params.q}
            placeholder={t("تخصص یا نام...", "Specialty or name...")}
          />
          <Select name="country" defaultValue={selectedCountry}>
            <option value="">{t("همه کشورها", "All countries")}</option>
            {data.countries.map((c: any) => (
              <option key={c.id} value={c.code}>
                {locale === "fa" ? c.nameFa : c.nameEn}
              </option>
            ))}
          </Select>
          <Select name="city" defaultValue={selectedCity} disabled={!selectedCountry}>
            <option value="">{t("همه شهرها", "All cities")}</option>
            {(selectedCountryData?.cities ?? []).map((c: any) => (
              <option key={c.id} value={c.slug}>
                {locale === "fa" ? c.nameFa : c.nameEn}
              </option>
            ))}
          </Select>
          <div className="flex gap-2">
            <Select name="serviceMode" defaultValue={selectedMode} className="flex-1">
              <option value="">{t("همه نوع ویزیت", "All visit types")}</option>
              <option value="online">{t("آنلاین", "Online")}</option>
              <option value="in_person">{t("حضوری", "In-person")}</option>
            </Select>
            <Button type="submit" className="shrink-0">
              <Icon name="search" className="h-4 w-4" />
              <span className="hidden sm:inline">{t("جستجو", "Search")}</span>
            </Button>
          </div>
        </form>

        <p className="mb-4 text-sm text-[var(--fg-subtle)]">
          {data.total} {t("پزشک پیدا شد", "doctors found")}
        </p>

        {data.doctors.length === 0 ? (
          <EmptyState
            icon="search"
            title={t("نتیجه‌ای پیدا نشد", "No results found")}
            description={t(
              "فیلترها را تغییر دهید یا کشور دیگری را انتخاب کنید.",
              "Try changing your filters or another country."
            )}
            action={
              activeFilter ? (
                <Link href="/doctors">
                  <Button variant="secondary" size="sm">
                    {t("پاک کردن فیلترها", "Clear filters")}
                  </Button>
                </Link>
              ) : undefined
            }
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.doctors.map((d: any) => (
              <DoctorCard key={d.id} doctor={d} locale={locale} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}