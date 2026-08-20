"use client";

import { useEffect, useState } from "react";
import { Icon, Card, EmptyState, cn } from "@wishubest/ui";
import { client } from "@/lib/clientApi";

interface Review {
  id: string;
  rating: number;
  comment: string | null;
  status: string;
  isVerified: boolean;
  createdAt: string;
  patientName: string;
}

export function ProviderReviewsUI({ locale }: { locale: "fa" | "en" }) {
  const t = (fa: string, en: string) => (locale === "fa" ? fa : en);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [summary, setSummary] = useState({ total: 0, average: 0 });

  useEffect(() => {
    (async () => {
      try {
        const res = await client.get<{ reviews: Review[]; summary: { total: number; average: number } }>(
          "/provider/reviews"
        );
        setReviews(res.reviews);
        setSummary(res.summary);
      } catch {
        // ignore
      }
    })();
  }, []);

  const fmt = (iso: string) =>
    new Date(iso).toLocaleString(locale === "fa" ? "fa-IR" : "en-US", { dateStyle: "medium" });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 sm:max-w-md">
        <Card>
          <p className="text-xs text-[var(--fg-subtle)]">{t("میانگین امتیاز", "Average rating")}</p>
          <p className="mt-1 text-2xl font-semibold text-[var(--fg)]" dir="ltr">
            {summary.average.toFixed(1)}
          </p>
        </Card>
        <Card>
          <p className="text-xs text-[var(--fg-subtle)]">{t("تعداد نظرات", "Total reviews")}</p>
          <p className="mt-1 text-2xl font-semibold text-[var(--fg)]">{summary.total}</p>
        </Card>
      </div>

      {reviews.length === 0 ? (
        <EmptyState icon="star" title={t("نظری وجود ندارد", "No reviews yet")} />
      ) : (
        <Card>
          <ul className="divide-y divide-[var(--border)]">
            {reviews.map((r) => (
              <li key={r.id} className="flex flex-col gap-2 py-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--bg-subtle)] text-xs font-semibold text-[var(--fg-muted)]">
                      {r.patientName.slice(0, 2).toUpperCase()}
                    </span>
                    <p className="text-sm font-medium text-[var(--fg)]">{r.patientName}</p>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[10px]",
                        r.status === "approved"
                          ? "bg-green-100 text-green-700"
                          : r.status === "rejected"
                            ? "bg-red-100 text-red-700"
                            : "bg-[var(--bg-subtle)] text-[var(--fg-muted)]"
                      )}
                    >
                      {r.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-0.5" dir="ltr">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <Icon
                        key={n}
                        name="star"
                        className={cn("h-4 w-4", n <= r.rating ? "text-amber-500" : "text-[var(--border)]")}
                      />
                    ))}
                  </div>
                </div>
                {r.comment && <p className="text-sm text-[var(--fg)]">{r.comment}</p>}
                <p className="text-xs text-[var(--fg-subtle)]">{fmt(r.createdAt)}</p>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}