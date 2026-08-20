import { cookies } from "next/headers";
import { api } from "@/lib/api";
import { PageHeader } from "@wishubest/ui";
import { PatientReviewsUI } from "@/components/PatientReviewsUI";

export const dynamic = "force-dynamic";

export default async function PatientReviewsPage() {
  const store = await cookies();
  const locale = (store.get("locale")?.value ?? "fa") as "fa" | "en";
  const t = (fa: string, en: string) => (locale === "fa" ? fa : en);

  await api.get("/auth/me");

  return (
    <div>
      <PageHeader title={t("نظرات من", "My reviews")} subtitle={t("تجربه خود را با دیگران به اشتراک بگذارید", "Share your experience")} />
      <PatientReviewsUI locale={locale} />
    </div>
  );
}