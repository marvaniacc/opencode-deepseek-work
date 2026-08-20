import { cookies } from "next/headers";
import { api } from "@/lib/api";
import { PageHeader } from "@wishubest/ui";
import { PatientDocumentsUI } from "@/components/PatientDocumentsUI";

export const dynamic = "force-dynamic";

export default async function PatientDocumentsPage() {
  const store = await cookies();
  const locale = (store.get("locale")?.value ?? "fa") as "fa" | "en";
  const t = (fa: string, en: string) => (locale === "fa" ? fa : en);

  await api.get("/auth/me");

  return (
    <div>
      <PageHeader
        title={t("اسناد پزشکی", "Medical documents")}
        subtitle={t("مدیریت و اشتراک‌گذاری امن مدارک با پزشک", "Securely manage and share records with your doctor")}
      />
      <PatientDocumentsUI locale={locale} />
    </div>
  );
}