"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Icon } from "@wishubest/ui";
import { client } from "@/lib/clientApi";

export function StartChatButton({
  providerId,
  locale,
  variant = "secondary",
}: {
  providerId: string;
  locale: "fa" | "en";
  variant?: "primary" | "secondary";
}) {
  const t = (fa: string, en: string) => (locale === "fa" ? fa : en);
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await client.post<{ thread: { id: string } }>("/chat/threads", { providerId });
      router.push(`/dashboard/patient/chat?thread=${res.thread.id}`);
    } catch (err: any) {
      setError(err.message ?? "failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-2">
      <Button onClick={start} variant={variant} loading={loading} className="w-full">
        <Icon name="chat" className="h-4 w-4" />
        {t("گفتگو با پزشک", "Chat with doctor")}
      </Button>
      {error && <p className="text-xs text-[var(--danger)]">{error}</p>}
    </div>
  );
}