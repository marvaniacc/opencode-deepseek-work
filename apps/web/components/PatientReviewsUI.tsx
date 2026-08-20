"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Icon, Card, EmptyState, cn } from "@wishubest/ui";
import { client } from "@/lib/clientApi";

interface Review {
  id: string;
  bookingId: string;
  rating: number;
  comment: string | null;
  status: string;
  isVerified: boolean;
  createdAt: string;
  providerName?: string;
  patientName?: string;
}

interface CompletedBooking {
  id: string;
  bookingNo: string;
  completedAt: string | null;
  serviceName?: string | null;
}

function Stars({ value, onChange }: { value: number; onChange?: (v: number) => void }) {
  return (
    <div className="flex gap-1" dir="ltr">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={onChange ? () => onChange(n) : undefined}
          disabled={!onChange}
          className={cn("text-lg", onChange && "cursor-pointer hover:scale-110", !onChange && "cursor-default")}
        >
          <Icon name="star" className={cn("h-5 w-5", n <= value ? "text-amber-500" : "text-[var(--border)]")} />
        </button>
      ))}
    </div>
  );
}

const fmt = (iso: string, locale: string) =>
  new Date(iso).toLocaleString(locale === "fa" ? "fa-IR" : "en-US", { dateStyle: "medium" });

export function PatientReviewsUI({ locale }: { locale: "fa" | "en" }) {
  const t = (fa: string, en: string) => (locale === "fa" ? fa : en);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [completed, setCompleted] = useState<{ id: string; bookingNo: string }[]>([]);
  const [selected, setSelected] = useState("");
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [r, b] = await Promise.all([
        client.get<{ reviews: Review[] }>("/reviews"),
        client.get<{ bookings: CompletedBooking[] }>("/bookings?status=completed"),
      ]);
      setReviews(r.reviews);
      const reviewed = new Set(r.reviews.map((rv) => rv.bookingId));
      setCompleted(b.bookings.filter((bk) => !reviewed.has(bk.id)).map((bk) => ({ id: bk.id, bookingNo: bk.bookingNo })));
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const submit = async () => {
    if (!selected || rating < 1) return;
    setSubmitting(true);
    setError(null);
    try {
      await client.post("/reviews", { bookingId: selected, rating, comment: comment.trim() || null });
      setSelected("");
      setRating(0);
      setComment("");
      await load();
    } catch (err: any) {
      setError(err.message ?? "submit_failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <Card>
        <div className="mb-3 flex items-center gap-2">
          <Icon name="star" className="h-4 w-4 text-[var(--fg-muted)]" />
          <h3 className="text-sm font-semibold text-[var(--fg)]">{t("نظرات من", "My reviews")}</h3>
        </div>
        {reviews.length === 0 ? (
          <EmptyState icon="star" title={t("نظری ثبت نشده", "No reviews yet")} />
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {reviews.map((r) => (
              <li key={r.id} className="flex flex-col gap-2 py-3">
                <div className="flex items-center justify-between">
                  <Stars value={r.rating} />
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
                {r.comment && <p className="text-sm text-[var(--fg)]">{r.comment}</p>}
                <p className="text-xs text-[var(--fg-subtle)]">
                  {r.providerName} · {fmt(r.createdAt, locale)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <h3 className="mb-3 text-sm font-semibold text-[var(--fg)]">{t("ثبت نظر", "Write a review")}</h3>
        {completed.length === 0 ? (
          <p className="text-xs text-[var(--fg-subtle)]">
            {t("برای ثبت نظر باید رزرو کامل شده داشته باشید.", "You need a completed booking to review.")}
          </p>
        ) : (
          <div className="space-y-3">
            <select
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              className="h-9 w-full rounded-[var(--radius-sm)] border border-[var(--border)] px-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
            >
              <option value="">{t("انتخاب رزرو...", "Select booking...")}</option>
              {completed.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.bookingNo}
                </option>
              ))}
            </select>
            <Stars value={rating} onChange={setRating} />
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={3}
              placeholder={t("نظر شما (اختیاری)", "Your comment (optional)")}
              className="w-full rounded-[var(--radius-sm)] border border-[var(--border)] p-3 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
            />
            <Button onClick={submit} loading={submitting} disabled={!selected || rating < 1} className="w-full">
              {t("ثبت نظر", "Submit review")}
            </Button>
            {error && <p className="text-xs text-[var(--danger)]">{error}</p>}
          </div>
        )}
      </Card>
    </div>
  );
}