"use client";

import { useState } from "react";
import { Button, formatMoney } from "@wishubest/ui";
import { client } from "@/lib/clientApi";

interface Service {
  id: string;
  serviceMode: "in_person" | "online";
  title: string;
  description?: string | null;
  priceMinor: number;
  durationMinutes: number;
}

export function BookPanel({
  doctorId,
  services,
  symbol,
  locale,
}: {
  doctorId: string;
  services: Service[];
  symbol: string;
  locale: "fa" | "en";
}) {
  const t = (fa: string, en: string) => (locale === "fa" ? fa : en);
  const [selected, setSelected] = useState<string>(services[0]?.id ?? "");
  const [booking, setBooking] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const service = services.find((s) => s.id === selected);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!service) return;
    setLoading(true);
    setError(null);
    try {
      const res = await client.post("/bookings", {
        providerId: doctorId,
        serviceId: service.id,
        patientNotes: "",
      });
      setBooking(res.booking);
      window.location.href = "/dashboard/patient/bookings";
    } catch (err: any) {
      setError(err.message ?? "booking_failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-[var(--radius)] border border-[var(--border)] p-6">
      <h2 className="mb-4 text-base font-semibold text-[var(--fg)]">
        {t("رزرو ویزیت", "Book a visit")}
      </h2>

      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-2">
          {services.map((s) => (
            <label
              key={s.id}
              className="flex cursor-pointer items-center justify-between gap-3 rounded-[var(--radius-sm)] border border-[var(--border)] px-4 py-3 transition-colors has-[:checked]:border-[var(--accent)] has-[:checked]:bg-[var(--accent-muted)]"
            >
              <span className="flex items-center gap-3">
                <input
                  type="radio"
                  name="service"
                  value={s.id}
                  checked={selected === s.id}
                  onChange={() => setSelected(s.id)}
                  className="h-4 w-4 accent-[var(--accent)]"
                />
                <span>
                  <span className="block text-sm font-medium text-[var(--fg)]">{s.title}</span>
                  <span className="block text-xs text-[var(--fg-subtle)]">
                    {s.serviceMode === "online" ? t("آنلاین", "Online") : t("حضوری", "In-person")} · {s.durationMinutes} {t("دقیقه", "min")}
                  </span>
                </span>
              </span>
              <span className="text-sm font-semibold text-[var(--fg)]">
                {formatMoney(s.priceMinor, symbol)}
              </span>
            </label>
          ))}
        </div>

        {error && (
          <p className="rounded-[var(--radius-sm)] bg-[var(--danger-muted)] px-3 py-2 text-xs text-[var(--danger)]">
            {error}
          </p>
        )}

        <Button type="submit" className="w-full" loading={loading} disabled={!service}>
          {t("درخواست رزرو", "Request booking")}
        </Button>
        <p className="text-center text-xs text-[var(--fg-subtle)]">
          {t("پزشک درخواست شما را تایید می‌کند.", "The doctor will confirm your request.")}
        </p>
      </form>
    </div>
  );
}