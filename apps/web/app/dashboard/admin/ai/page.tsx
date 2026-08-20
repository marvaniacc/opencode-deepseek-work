import { cookies } from "next/headers";
import { api } from "@/lib/api";
import { PageHeader } from "@wishubest/ui";
import { AdminAISettingsUI } from "@/components/AdminAISettingsUI";

export const dynamic = "force-dynamic";

export default async function AdminAISettingsPage() {
  const store = await cookies();
  const locale = (store.get("locale")?.value ?? "fa") as "fa" | "en";
  const t = (fa: string, en: string) => (locale === "fa" ? fa : en);

  await api.get("/auth/me");

  return (
    <div>
      <PageHeader
        title={t("تنظیمات ترجمه هوشمند", "AI translation settings")}
        subtitle={t("مدیریت ارائه‌دهنده، مدل و کلید API", "Manage provider, model and API key")}
      />
      <AdminAISettingsUI locale={locale} />
    </div>
  );
}