"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Icon, Card, EmptyState, cn } from "@wishubest/ui";
import { client } from "@/lib/clientApi";

interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string;
  payload: any;
  readAt: string | null;
  createdAt: string;
}

export function NotificationsList({ locale }: { locale: "fa" | "en" }) {
  const t = (fa: string, en: string) => (locale === "fa" ? fa : en);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);

  const load = useCallback(async () => {
    try {
      const res = await client.get<{ unread: number; notifications: NotificationItem[] }>("/notifications");
      setUnread(res.unread);
      setItems(res.notifications);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const read = async (id: string) => {
    await client.post(`/notifications/${id}/read`);
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n)));
    setUnread((u) => Math.max(0, u - 1));
  };

  const readAll = async () => {
    await client.post("/notifications/read-all");
    setItems((prev) => prev.map((n) => ({ ...n, readAt: new Date().toISOString() })));
    setUnread(0);
  };

  const fmt = (iso: string) =>
    new Date(iso).toLocaleString(locale === "fa" ? "fa-IR" : "en-US", { dateStyle: "medium", timeStyle: "short" });

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      {unread > 0 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-[var(--fg-subtle)]">
            {t("تعداد اعلان‌های خوانده‌نشده", "Unread notifications")}: {unread}
          </p>
          <Button size="sm" variant="ghost" onClick={readAll}>
            {t("خواندن همه", "Mark all read")}
          </Button>
        </div>
      )}
      {items.length === 0 ? (
        <EmptyState icon="bell" title={t("اعلانی ندارید", "No notifications")} />
      ) : (
        <Card>
          <ul className="divide-y divide-[var(--border)]">
            {items.map((n) => (
              <li key={n.id} className="flex items-start gap-3 py-3">
                <span
                  className={cn(
                    "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                    n.readAt ? "bg-transparent" : "bg-[var(--accent)]"
                  )}
                />
                <div className="min-w-0 flex-1">
                  <p className={cn("text-sm", n.readAt ? "text-[var(--fg-muted)]" : "font-medium text-[var(--fg)]")}>
                    {n.title}
                  </p>
                  <p className="mt-0.5 text-xs text-[var(--fg-subtle)]">{n.body}</p>
                  <p className="mt-1 text-[10px] text-[var(--fg-subtle)]">{fmt(n.createdAt)}</p>
                </div>
                {!n.readAt && (
                  <Button size="sm" variant="ghost" onClick={() => read(n.id)}>
                    {t("خوانده شد", "Mark read")}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}