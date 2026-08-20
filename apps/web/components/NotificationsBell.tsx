"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Icon, cn } from "@wishubest/ui";
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

export function NotificationsBell({ role, locale }: { role: string; locale: "fa" | "en" }) {
  const t = (fa: string, en: string) => (locale === "fa" ? fa : en);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const router = useRouter();
  const pathname = usePathname();

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
    const id = setInterval(load, 15000);
    return () => clearInterval(id);
  }, [load]);

  // Close the dropdown on navigation
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const markAll = async () => {
    await client.post("/notifications/read-all");
    setUnread(0);
    setItems((prev) => prev.map((n) => ({ ...n, readAt: new Date().toISOString() })));
  };

  const goto = async (n: NotificationItem) => {
    if (!n.readAt) {
      await client.post(`/notifications/${n.id}/read`);
      setUnread((u) => Math.max(0, u - 1));
    }
    const target = n.type === "booking_requested" ? `/dashboard/provider/bookings`
      : n.type === "booking_confirmed" || n.type === "booking_cancelled" || n.type === "invoice_paid"
        ? `/dashboard/${role === "provider" ? "patient" : role}/bookings`
        : n.type === "review" ? `/dashboard/${role}/reviews` : null;
    setOpen(false);
    if (target) router.push(target);
  };

  return (
    <div className="relative">
      <button
        onClick={() => {
          setOpen((v) => !v);
          load();
        }}
        className="relative flex h-9 w-9 items-center justify-center rounded-full text-[var(--fg-muted)] transition-colors hover:bg-[var(--bg-subtle)]"
        aria-label={t("اعلان‌ها", "Notifications")}
      >
        <Icon name="bell" className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--accent)] px-1 text-[9px] font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-11 z-50 w-80 overflow-hidden rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg)] shadow-lg">
          <div className="flex items-center justify-between border-b border-[var(--border)] px-3 py-2">
            <p className="text-sm font-semibold text-[var(--fg)]">{t("اعلان‌ها", "Notifications")}</p>
            {unread > 0 && (
              <button onClick={markAll} className="text-xs text-[var(--accent)] hover:underline">
                {t("خواندن همه", "Mark all read")}
              </button>
            )}
          </div>
          <ul className="max-h-80 divide-y divide-[var(--border)] overflow-y-auto">
            {items.length === 0 ? (
              <li className="px-3 py-6 text-center text-xs text-[var(--fg-subtle)]">
                {t("اعلانی ندارید", "No notifications")}
              </li>
            ) : (
              items.map((n) => (
                <li key={n.id}>
                  <button
                    onClick={() => goto(n)}
                    className={cn(
                      "flex w-full items-start gap-2 px-3 py-2.5 text-left transition-colors hover:bg-[var(--bg-muted)]",
                      !n.readAt && "bg-[var(--accent-muted)]"
                    )}
                  >
                    <span
                      className={cn(
                        "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                        n.readAt ? "bg-transparent" : "bg-[var(--accent)]"
                      )}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-[var(--fg)]">{n.title}</span>
                      <span className="block truncate text-xs text-[var(--fg-subtle)]">{n.body}</span>
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>
          <Link
            href={`/dashboard/${role}/notifications`}
            className="block border-t border-[var(--border)] px-3 py-2 text-center text-xs text-[var(--accent)] hover:bg-[var(--bg-muted)]"
            onClick={() => setOpen(false)}
          >
            {t("مشاهده همه", "View all")}
          </Link>
        </div>
      )}
    </div>
  );
}