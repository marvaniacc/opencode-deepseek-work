import Link from "next/link";
import { Badge, Icon, formatMoney } from "@wishubest/ui";

export function DoctorCard({
  doctor,
  locale,
}: {
  doctor: {
    id: string;
    title?: string | null;
    specialty?: string | null;
    bio?: string | null;
    hasOnline?: boolean;
    hasInPerson?: boolean;
    minPriceMinor?: number | null;
    currencyCode?: string | null;
    locations?: Array<{ name: string; city?: { nameFa: string; nameEn: string } | null }>;
    avgRating?: number | null;
    reviewCount?: number;
  };
  locale: "fa" | "en";
}) {
  const isFa = locale === "fa";
  const city = doctor.locations?.[0]?.city;
  const symbol = doctor.currencyCode === "USD" ? "$" : doctor.currencyCode ?? "";

  return (
    <Link
      href={`/doctors/${doctor.id}`}
      className="group flex flex-col gap-4 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg)] p-5 transition-all hover:border-[var(--border-strong)] hover:shadow-[var(--shadow-subtle)]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--bg-subtle)] text-base font-semibold text-[var(--fg-muted)]">
            {(doctor.title ?? "").replace(".", "").slice(0, 1) || "D"}
          </span>
          <div>
            <p className="text-sm font-semibold text-[var(--fg)]">
              {doctor.title ?? ""} {doctor.specialty ?? ""}
            </p>
            <p className="text-xs text-[var(--fg-subtle)]">
              {doctor.specialty ? (isFa ? doctor.specialty : doctor.specialty) : ""}
            </p>
          </div>
        </div>
        {doctor.avgRating ? (
          <span className="flex items-center gap-1 text-xs font-medium text-[var(--fg-muted)]">
            <Icon name="star" className="h-3.5 w-3.5 text-[var(--warning)]" />
            {doctor.avgRating}
          </span>
        ) : null}
      </div>

      <p className="line-clamp-2 text-sm leading-relaxed text-[var(--fg-muted)]">{doctor.bio}</p>

      <div className="mt-auto flex items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {doctor.hasOnline && (
            <Badge tone="accent">
              <Icon name="video" className="h-3 w-3" />
              {isFa ? "آنلاین" : "Online"}
            </Badge>
          )}
          {doctor.hasInPerson && (
            <Badge tone="neutral">
              <Icon name="building" className="h-3 w-3" />
              {isFa ? "حضوری" : "In-person"}
            </Badge>
          )}
        </div>
        <span className="text-sm font-semibold text-[var(--fg)]">
          {doctor.minPriceMinor != null
            ? `${formatMoney(doctor.minPriceMinor, symbol)}${isFa ? " از" : " from"}`
            : ""}
        </span>
      </div>

      {city && (
        <p className="flex items-center gap-1 text-xs text-[var(--fg-subtle)]">
          <Icon name="mapPin" className="h-3.5 w-3.5" />
          {isFa ? city.nameFa : city.nameEn}
        </p>
      )}
    </Link>
  );
}