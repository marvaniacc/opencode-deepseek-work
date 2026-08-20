import { cookies } from "next/headers";
import { api } from "@/lib/api";
import { PageHeader } from "@wishubest/ui";
import { ProviderDocumentsUI } from "@/components/ProviderDocumentsUI";

export const dynamic = "force-dynamic";

export default async function ProviderDocumentsPage() {
  const store = await cookies();
  const locale = (store.get("locale")?.value ?? "fa") as "fa" | "en";
  const t = (fa: string, en: string) => (locale === "fa" ? fa : en);

  await api.get("/auth/me");

  return (
    <div>
      <PageHeader
        title={t("اسناد بیماران", "Patient documents")}
        subtitle={t("مدارکی که بیماران با شما به اشتراک گذاشته‌اند", "Records shared with you by patients")}
      />
      <ProviderDocumentsUI locale={locale} />
    </div>
  );
}