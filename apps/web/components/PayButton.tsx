"use client";

import { useState } from "react";
import { Button } from "@wishubest/ui";
import { client } from "@/lib/clientApi";

export function PayButton({ bookingId, locale }: { bookingId: string; locale: "fa" | "en" }) {
  const t = (fa: string, en: string) => (locale === "fa" ? fa : en);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pay = async () => {
    setLoading(true);
    setError(null);
    try {
      await client.post(`/bookings/${bookingId}/pay`);
      window.location.reload();
    } catch (err: any) {
      setError(err.message ?? "payment_failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-2">
      <Button onClick={pay} loading={loading} className="w-full">
        {t("پرداخت و تایید نهایی", "Pay & confirm")}
      </Button>
      {error && (
        <p className="rounded-[var(--radius-sm)] bg-[var(--danger-muted)] px-3 py-2 text-xs text-[var(--danger)]">
          {error}
        </p>
      )}
    </div>
  );
}