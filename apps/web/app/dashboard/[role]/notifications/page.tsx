import { cookies } from "next/headers";
import { api } from "@/lib/api";
import { PageHeader } from "@wishubest/ui";
import { NotificationsList } from "@/components/NotificationsList";

export const dynamic = "force-dynamic";

export default async function NotificationsPage({ params }: { params: Promise<{ role: string }> }) {
  const { role } = await params;
  const store = await cookies();
  const locale = (store.get("locale")?.value ?? "fa") as "fa" | "en";
  const t = (fa: string, en: string) => (locale === "fa" ? fa : en);

  await api.get("/auth/me");

  return (
    <div>
      <PageHeader title={t("اعلان‌ها", "Notifications")} subtitle={t("رویدادهای اخیر حساب شما", "Recent account activity")} />
      <NotificationsList locale={locale} />
    </div>
  );
}