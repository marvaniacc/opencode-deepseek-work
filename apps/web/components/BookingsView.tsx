import Link from "next/link";
import {
  Badge,
  Button,
  Card,
  StatusBadge,
  EmptyState,
  formatMoney,
  formatDate,
} from "@wishubest/ui";
import { PayButton } from "./PayButton";
import { ProviderBookingActions, CompleteButton, CancelButton } from "./BookingActions";

export function BookingsView({
  bookings,
  role,
  locale,
  symbol,
}: {
  bookings: any[];
  role: "patient" | "provider";
  locale: "fa" | "en";
  symbol: string;
}) {
  const t = (fa: string, en: string) => (locale === "fa" ? fa : en);

  if (bookings.length === 0) {
    return (
      <EmptyState
        icon="calendar"
        title={t("رزروی وجود ندارد", "No bookings yet")}
        description={
          role === "patient"
            ? t("از صفحه پزشکان یک ویزیت رزرو کنید.", "Find a doctor and book a visit.")
            : t("وقتی بیماری رزرو کند اینجا نمایش داده می‌شود.", "Patient requests will appear here.")
        }
        action={
          role === "patient" ? (
            <Link href="/doctors">
              <Button variant="secondary" size="sm">
                {t("جستجوی پزشک", "Find a doctor")}
              </Button>
            </Link>
          ) : undefined
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      {bookings.map((b) => (
        <Card key={b.id} className="!p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-sm font-semibold text-[var(--fg)]">{b.bookingNo}</span>
                <StatusBadge status={b.status} />
                {b.serviceMode === "online" ? (
                  <Badge tone="accent">
                    {t("آنلاین", "Online")}
                  </Badge>
                ) : (
                  <Badge tone="neutral">{t("حضوری", "In-person")}</Badge>
                )}
              </div>
              <p className="mt-1.5 text-sm text-[var(--fg-muted)]">
                {role === "patient"
                  ? `${b.provider?.title ?? ""} ${b.provider?.specialty ?? ""}`
                  : `${b.patient?.firstName ?? ""} ${b.patient?.lastName ?? ""}`}
                {" · "}
                {b.service?.title ?? ""}
              </p>
              <p className="mt-0.5 text-xs text-[var(--fg-subtle)]">
                {formatDate(b.requestedAt, locale)}
                {b.location?.city ? ` · ${locale === "fa" ? b.location.city.nameFa : b.location.city.nameEn}` : ""}
              </p>

              {b.meetingLink && (
                <a
                  href={b.meetingLink}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-[var(--accent)] hover:underline"
                >
                  {t("لینک ویزیت آنلاین", "Join online visit")} →
                </a>
              )}

              {b.status === "awaiting_payment" && b.invoice && (
                <div className="mt-3 rounded-[var(--radius-sm)] bg-[var(--bg-muted)] px-4 py-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="text-[var(--fg-subtle)]">
                        {t("مبلغ", "Total")}:
                      </span>{" "}
                      <span className="font-semibold text-[var(--fg)]">
                        {formatMoney(b.invoice.totalMinor, symbol)}
                      </span>
                    </div>
                    <span className="text-xs text-[var(--fg-subtle)]">
                      {t("شامل کارمزد پلتفرم", "incl. platform fee")}{" "}
                      {formatMoney(b.invoice.platformFeeMinor, symbol)}
                    </span>
                  </div>
                </div>
              )}
            </div>

            <div className="flex shrink-0 flex-col items-end gap-2">
              {role === "patient" && b.status === "awaiting_payment" && (
                <PayButton bookingId={b.id} locale={locale} />
              )}
              {role === "patient" &&
                (b.status === "requested" || b.status === "awaiting_payment") && (
                  <CancelButton bookingId={b.id} locale={locale} />
                )}
              {role === "provider" && b.status === "requested" && (
                <ProviderBookingActions
                  bookingId={b.id}
                  serviceMode={b.serviceMode}
                  locale={locale}
                />
              )}
              {role === "provider" && b.status === "confirmed" && (
                <CompleteButton bookingId={b.id} locale={locale} />
              )}
              {role === "provider" &&
                (b.status === "requested" || b.status === "awaiting_payment") && (
                  <CancelButton bookingId={b.id} locale={locale} label={t("لغو رزرو", "Cancel booking")} />
                )}
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}