import { cookies } from "next/headers";
import { api } from "@/lib/api";
import { PageHeader } from "@wishubest/ui";
import { ProviderReviewsUI } from "@/components/ProviderReviewsUI";

export const dynamic = "force-dynamic";

export default async function ProviderReviewsPage() {
  const store = await cookies();
  const locale = (store.get("locale")?.value ?? "fa") as "fa" | "en";
  const t = (fa: string, en: string) => (locale === "fa" ? fa : en);

  await api.get("/auth/me");

  return (
    <div>
      <PageHeader title={t("نظرات بیماران", "Patient reviews")} subtitle={t("بازخورد دریافت‌شده", "Feedback you received")} />
      <ProviderReviewsUI locale={locale} />
    </div>
  );
}