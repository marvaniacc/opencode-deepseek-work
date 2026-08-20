"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Card, EmptyState, Icon, cn } from "@wishubest/ui";
import { client } from "@/lib/clientApi";

interface Review {
  id: string;
  rating: number;
  comment: string | null;
  status: string;
  isVerified: boolean;
  createdAt: string;
  patientName: string;
  providerName: string;
}

export function AdminReviewsUI({ locale }: { locale: "fa" | "en" }) {
  const t = (fa: string, en: string) => (locale === "fa" ? fa : en);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [filter, setFilter] = useState<string>("pending");

  const load = useCallback(async () => {
    try {
      const res = await client.get<{ reviews: Review[] }>(`/admin/reviews${filter ? `?status=${filter}` : ""}`);
      setReviews(res.reviews);
    } catch {
      // ignore
    }
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  const decide = async (id: string, status: string) => {
    try {
      await client.patch(`/admin/reviews/${id}`, { status });
      await load();
    } catch {
      // ignore
    }
  };

  const fmt = (iso: string) =>
    new Date(iso).toLocaleString(locale === "fa" ? "fa-IR" : "en-US", { dateStyle: "medium" });

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {["pending", "approved", "rejected"].map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={cn(
              "rounded-[var(--radius-sm)] px-3 py-1.5 text-sm transition-colors",
              filter === s
                ? "bg-[var(--accent)] text-[var(--accent-fg)]"
                : "bg-[var(--bg-subtle)] text-[var(--fg-muted)] hover:text-[var(--fg)]"
            )}
          >
            {s}
          </button>
        ))}
      </div>

      {reviews.length === 0 ? (
        <EmptyState icon="star" title={t("موردی نیست", "Nothing here")} />
      ) : (
        <Card>
          <ul className="divide-y divide-[var(--border)]">
            {reviews.map((r) => (
              <li key={r.id} className="flex flex-col gap-2 py-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[var(--fg)]">
                      {r.patientName} → {r.providerName}
                    </p>
                    <p className="text-xs text-[var(--fg-subtle)]">{fmt(r.createdAt)}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1" dir="ltr">
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
                <div className="flex items-center gap-2">
                  {r.isVerified && (
                    <span className="flex items-center gap-1 text-[10px] text-green-600">
                      <Icon name="check" className="h-3 w-3" />
                      {t("تأیید شده (رزرو کامل)", "Verified (completed booking)")}
                    </span>
                  )}
                  {r.status === "pending" && (
                    <div className="ml-auto flex gap-2">
                      <Button size="sm" onClick={() => decide(r.id, "approved")}>
                        {t("تأیید", "Approve")}
                      </Button>
                      <Button size="sm" variant="danger" onClick={() => decide(r.id, "rejected")}>
                        {t("رد", "Reject")}
                      </Button>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}