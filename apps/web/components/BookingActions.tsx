"use client";

import { useState } from "react";
import { Button, Input } from "@wishubest/ui";
import { client } from "@/lib/clientApi";

export function ProviderBookingActions({
  bookingId,
  serviceMode,
  locale,
}: {
  bookingId: string;
  serviceMode: "in_person" | "online";
  locale: "fa" | "en";
}) {
  const t = (fa: string, en: string) => (locale === "fa" ? fa : en);
  const [meetingLink, setMeetingLink] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const act = async (action: "confirm" | "reject" | "complete" | "cancel") => {
    setBusy(action);
    setError(null);
    try {
      if (action === "confirm") {
        await client.post(`/bookings/${bookingId}/confirm`, {
          meetingLink: serviceMode === "online" ? meetingLink : undefined,
        });
      } else if (action === "complete") {
        await client.post(`/bookings/${bookingId}/complete`);
      } else if (action === "reject") {
        await client.post(`/bookings/${bookingId}/reject`);
      } else {
        await client.post(`/bookings/${bookingId}/cancel`);
      }
      window.location.reload();
    } catch (err: any) {
      setError(err.message ?? "action_failed");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-3">
      {serviceMode === "online" && (
        <Input
          label={t("لینک ویزیت آنلاین (Zoom/Meet/WhatsApp)", "Online visit link (Zoom/Meet/WhatsApp)")}
          placeholder="https://meet.google.com/..."
          value={meetingLink}
          onChange={(e) => setMeetingLink(e.target.value)}
        />
      )}
      {error && (
        <p className="rounded-[var(--radius-sm)] bg-[var(--danger-muted)] px-3 py-2 text-xs text-[var(--danger)]">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          onClick={() => act("confirm")}
          loading={busy === "confirm"}
          disabled={serviceMode === "online" && !meetingLink.trim()}
        >
          {t("تایید و صدور فاکتور", "Confirm & invoice")}
        </Button>
        <Button size="sm" variant="danger" onClick={() => act("reject")} loading={busy === "reject"}>
          {t("رد", "Reject")}
        </Button>
      </div>
    </div>
  );
}

export function CompleteButton({ bookingId, locale }: { bookingId: string; locale: "fa" | "en" }) {
  const t = (fa: string, en: string) => (locale === "fa" ? fa : en);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const complete = async () => {
    setBusy(true);
    setError(null);
    try {
      await client.post(`/bookings/${bookingId}/complete`);
      window.location.reload();
    } catch (err: any) {
      setError(err.message ?? "action_failed");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-2">
      <Button size="sm" variant="success" onClick={complete} loading={busy}>
        {t("تکمیل ویزیت", "Complete visit")}
      </Button>
      {error && <p className="text-xs text-[var(--danger)]">{error}</p>}
    </div>
  );
}

export function CancelButton({
  bookingId,
  locale,
  label,
}: {
  bookingId: string;
  locale: "fa" | "en";
  label?: string;
}) {
  const t = (fa: string, en: string) => (locale === "fa" ? fa : en);
  const [busy, setBusy] = useState(false);
  const cancel = async () => {
    setBusy(true);
    try {
      await client.post(`/bookings/${bookingId}/cancel`);
      window.location.reload();
    } finally {
      setBusy(false);
    }
  };
  return (
    <Button size="sm" variant="danger" onClick={cancel} loading={busy}>
      {label ?? t("لغو", "Cancel")}
    </Button>
  );
}