import Link from "next/link";
import { cookies } from "next/headers";
import { api } from "@/lib/api";
import { AppLogo, Badge, Button, Icon, formatMoney, formatDate } from "@wishubest/ui";
import { LocaleSwitcher } from "@/components/LocaleSwitcher";
import { BookPanel } from "@/components/BookPanel";

export const dynamic = "force-dynamic";

export default async function DoctorDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const store = await cookies();
  const locale = (store.get("locale")?.value ?? "fa") as "fa" | "en";
  const t = (fa: string, en: string) => (locale === "fa" ? fa : en);
  const session = store.get("wishubest_session")?.value;

  const data = await api.get(`/public/doctors/${id}`, { withAuth: false });
  const d = data.doctor;
  const symbol = d.currencyCode === "USD" ? "$" : d.currencyCode ?? "";

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <header className="sticky top-0 z-20 border-b border-[var(--border)] bg-[var(--bg)]/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 md:px-8">
          <Link href="/">
            <AppLogo />
          </Link>
          <div className="flex items-center gap-2">
            <LocaleSwitcher locale={locale} />
            <Link href="/auth/login">
              <Button size="sm" variant="secondary">
                {t("ورود", "Sign in")}
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-10 md:px-8">
        <Link href="/doctors" className="mb-6 inline-flex items-center gap-1.5 text-sm text-[var(--fg-subtle)] hover:text-[var(--fg)]">
          <Icon name="arrowRight" className="h-4 w-4 rtl:rotate-180" />
          {t("بازگشت به لیست پزشکان", "Back to doctors")}
        </Link>

        <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
          {/* Left: profile */}
          <div>
            <div className="flex flex-wrap items-start gap-5">
              <span className="flex h-20 w-20 items-center justify-center rounded-full bg-[var(--bg-subtle)] text-2xl font-semibold text-[var(--fg-muted)]">
                {(d.title ?? "").replace(".", "").slice(0, 1) || "D"}
              </span>
              <div className="flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl font-semibold tracking-tight text-[var(--fg)]">
                    {d.title} {d.specialty}
                  </h1>
                  {d.verifiedAt && (
                    <Badge tone="success">
                      <Icon name="shield" className="h-3 w-3" />
                      {t("تاییدشده", "Verified")}
                    </Badge>
                  )}
                </div>
                <p className="mt-1 text-sm text-[var(--fg-muted)]">{d.specialty}</p>
                {d.avgRating && (
                  <p className="mt-1 flex items-center gap-1 text-sm text-[var(--fg-muted)]">
                    <Icon name="star" className="h-4 w-4 text-[var(--warning)]" />
                    <span className="font-medium text-[var(--fg)]">{d.avgRating}</span>
                    ({d.reviewCount} {t("نظر", "reviews")})
                  </p>
                )}
              </div>
            </div>

            <div className="mt-8 space-y-8">
              {d.bio && (
                <section>
                  <h2 className="mb-2 text-base font-semibold text-[var(--fg)]">
                    {t("درباره پزشک", "About")}
                  </h2>
                  <p className="text-sm leading-relaxed text-[var(--fg-muted)]">{d.bio}</p>
                </section>
              )}

              <section>
                <h2 className="mb-3 text-base font-semibold text-[var(--fg)]">
                  {t("خدمات", "Services")}
                </h2>
                <div className="space-y-3">
                  {d.services.map((s: any) => (
                    <div
                      key={s.id}
                      className="flex items-center justify-between gap-4 rounded-[var(--radius)] border border-[var(--border)] p-4"
                    >
                      <div className="flex items-center gap-3">
                        <span className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--accent-muted)] text-[var(--accent)]">
                          <Icon name={s.serviceMode === "online" ? "video" : "building"} className="h-4 w-4" />
                        </span>
                        <div>
                          <p className="text-sm font-medium text-[var(--fg)]">{s.title}</p>
                          <p className="text-xs text-[var(--fg-subtle)]">
                            {s.serviceMode === "online"
                              ? t("ویزیت آنلاین", "Online visit")
                              : t("ویزیت حضوری", "In-person visit")}
                            {" · "}
                            {s.durationMinutes} {t("دقیقه", "min")}
                          </p>
                        </div>
                      </div>
                      <p className="text-sm font-semibold text-[var(--fg)]">
                        {formatMoney(s.priceMinor, symbol)}
                      </p>
                    </div>
                  ))}
                </div>
              </section>

              {d.locations.length > 0 && (
                <section>
                  <h2 className="mb-3 text-base font-semibold text-[var(--fg)]">
                    {t("مطب‌ها", "Locations")}
                  </h2>
                  <div className="space-y-3">
                    {d.locations.map((l: any) => (
                      <div key={l.id} className="flex items-start gap-3 text-sm text-[var(--fg-muted)]">
                        <Icon name="mapPin" className="mt-0.5 h-4 w-4 text-[var(--fg-subtle)]" />
                        <div>
                          <p className="font-medium text-[var(--fg)]">{l.name}</p>
                          <p>
                            {l.address} — {locale === "fa" ? l.city?.nameFa : l.city?.nameEn}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {data.reviews.length > 0 && (
                <section>
                  <h2 className="mb-3 text-base font-semibold text-[var(--fg)]">
                    {t("نظرات بیماران", "Patient reviews")}
                  </h2>
                  <div className="space-y-3">
                    {data.reviews.map((r: any) => (
                      <div key={r.id} className="rounded-[var(--radius)] border border-[var(--border)] p-4">
                        <div className="mb-1.5 flex items-center justify-between">
                          <p className="text-sm font-medium text-[var(--fg)]">{r.patientName}</p>
                          <span className="flex items-center gap-1 text-xs text-[var(--fg-muted)]">
                            <Icon name="star" className="h-3.5 w-3.5 text-[var(--warning)]" />
                            {r.rating}
                          </span>
                        </div>
                        {r.comment && <p className="text-sm text-[var(--fg-muted)]">{r.comment}</p>}
                        <p className="mt-2 text-xs text-[var(--fg-subtle)]">{formatDate(r.createdAt, locale)}</p>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>
          </div>

          {/* Right: booking panel */}
          <div className="lg:sticky lg:top-20 lg:self-start">
            {session ? (
              <BookPanel doctorId={id} services={d.services} symbol={symbol} locale={locale} />
            ) : (
              <div className="rounded-[var(--radius)] border border-[var(--border)] p-6 text-center">
                <Icon name="lock" className="mx-auto h-6 w-6 text-[var(--fg-subtle)]" />
                <p className="mt-3 text-sm font-medium text-[var(--fg)]">
                  {t("برای رزرو وارد شوید", "Sign in to book")}
                </p>
                <p className="mt-1 text-xs text-[var(--fg-subtle)]">
                  {t("برای رزرو ویزیت باید حساب کاربری داشته باشید.", "You need an account to book a visit.")}
                </p>
                <Link href={`/auth/login?next=/doctors/${id}`} className="mt-4 block">
                  <Button className="w-full">{t("ورود / ثبت‌نام", "Sign in / Register")}</Button>
                </Link>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}