import Link from "next/link";
import { cookies } from "next/headers";
import { api } from "@/lib/api";
import { LocaleSwitcher } from "@/components/LocaleSwitcher";
import { DoctorCard } from "@/components/DoctorCard";
import { Button, AppLogo, Icon } from "@wishubest/ui";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const store = await cookies();
  const locale = (store.get("locale")?.value ?? "fa") as "fa" | "en";
  const t = (fa: string, en: string) => (locale === "fa" ? fa : en);

  let data: any = { featured: [], countries: [], doctorsCount: 0 };
  try {
    data = await api.get("/public/marketplace", { withAuth: false });
  } catch {
    // fall back to empty state if API is down
  }

  const doctorTitles = t(
    "پزشک را پیدا کن، ویزیت بگیر، درمان شو",
    "Find your doctor, book a visit, get better"
  );

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <header className="sticky top-0 z-20 border-b border-[var(--border)] bg-[var(--bg)]/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 md:px-8">
          <Link href="/">
            <AppLogo />
          </Link>
          <nav className="hidden items-center gap-6 text-sm text-[var(--fg-muted)] md:flex">
            <Link className="transition-colors hover:text-[var(--fg)]" href="/doctors">
              {t("پزشکان", "Doctors")}
            </Link>
            <Link className="transition-colors hover:text-[var(--fg)]" href="/auth/login">
              {t("ورود", "Sign in")}
            </Link>
          </nav>
          <div className="flex items-center gap-2">
            <LocaleSwitcher locale={locale} />
            <Link href="/auth/login" className="md:hidden">
              <Button size="sm">{t("ورود", "Sign in")}</Button>
            </Link>
          </div>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="mx-auto max-w-6xl px-4 pb-16 pt-20 md:px-8 md:pt-28">
          <div className="mx-auto max-w-2xl text-center">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--bg-muted)] px-3 py-1 text-xs font-medium text-[var(--fg-muted)]">
              <Icon name="shield" className="h-3.5 w-3.5" />
              {t("پزشکان تاییدشده", "Verified doctors")}
            </span>
            <h1 className="mt-6 text-4xl font-semibold tracking-tight text-[var(--fg)] md:text-6xl">
              {doctorTitles}
            </h1>
            <p className="mt-5 text-base leading-relaxed text-[var(--fg-muted)] md:text-lg">
              {t(
                "رزرو ویزیت حضوری یا آنلاین، چت با ترجمه‌ی هوشمند، و مدارک پزشکی امن — همه در یک‌جا.",
                "Book in-person or online visits, chat with AI translation, and keep your medical documents secure — all in one place."
              )}
            </p>
            <div className="mt-8 flex items-center justify-center gap-3">
              <Link href="/doctors">
                <Button size="lg">
                  {t("جستجوی پزشک", "Find a doctor")}
                  <Icon name="arrowRight" className="h-4 w-4 rtl:rotate-180" />
                </Button>
              </Link>
              <Link href="/auth/register">
                <Button size="lg" variant="secondary">
                  {t("ثبت‌نام", "Join WishUBest")}
                </Button>
              </Link>
            </div>
            <p className="mt-6 text-sm text-[var(--fg-subtle)]">
              {t(
                `${data.doctorsCount} پزشک فعال در ${data.countries.length} کشور`,
                `${data.doctorsCount} active doctors across ${data.countries.length} countries`
              )}
            </p>
          </div>
        </section>

        {/* Countries */}
        {data.countries.length > 0 && (
          <section className="mx-auto max-w-6xl px-4 pb-12 md:px-8">
            <h2 className="mb-4 text-lg font-semibold text-[var(--fg)]">
              {t("جستجو بر اساس کشور", "Browse by country")}
            </h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {data.countries.map((c: any) => (
                <Link
                  key={c.id}
                  href={`/doctors?country=${c.code}`}
                  className="flex items-center gap-3 rounded-[var(--radius)] border border-[var(--border)] px-4 py-3 transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--bg-muted)]"
                >
                  <span className="text-xl">{c.flag ?? "🌍"}</span>
                  <div>
                    <p className="text-sm font-medium text-[var(--fg)]">{locale === "fa" ? c.nameFa : c.nameEn}</p>
                    <p className="text-xs text-[var(--fg-subtle)]">
                      {c.cities.length} {t("شهر", "cities")}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Featured doctors */}
        {data.featured.length > 0 && (
          <section className="mx-auto max-w-6xl px-4 pb-20 md:px-8">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-[var(--fg)]">
                {t("پزشکان برجسته", "Featured doctors")}
              </h2>
              <Link
                href="/doctors"
                className="text-sm font-medium text-[var(--accent)] hover:underline"
              >
                {t("مشاهده همه", "View all")} ←
              </Link>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {data.featured.map((d: any) => (
                <DoctorCard key={d.id} doctor={d} locale={locale} />
              ))}
            </div>
          </section>
        )}
      </main>

      <footer className="border-t border-[var(--border)] py-10">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 text-sm text-[var(--fg-subtle)] md:flex-row md:px-8">
          <AppLogo />
          <p>© {new Date().getFullYear()} WishUBest</p>
        </div>
      </footer>
    </div>
  );
}