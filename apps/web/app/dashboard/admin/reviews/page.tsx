import { cookies } from "next/headers";
import { api } from "@/lib/api";
import { PageHeader } from "@wishubest/ui";
import { AdminReviewsUI } from "@/components/AdminReviewsUI";

export const dynamic = "force-dynamic";

export default async function AdminReviewsPage() {
  const store = await cookies();
  const locale = (store.get("locale")?.value ?? "fa") as "fa" | "en";
  const t = (fa: string, en: string) => (locale === "fa" ? fa : en);

  await api.get("/auth/me");

  return (
    <div>
      <PageHeader title={t("مدیریت نظرات", "Review moderation")} subtitle={t("صندوق بررسی نظرات کاربران", "Review moderation queue")} />
      <AdminReviewsUI locale={locale} />
    </div>
  );
}