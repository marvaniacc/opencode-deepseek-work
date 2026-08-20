import { cookies } from "next/headers";
import { api } from "@/lib/api";
import { PageHeader } from "@wishubest/ui";
import { ChatUI } from "@/components/ChatUI";

export const dynamic = "force-dynamic";

export default async function ProviderChatPage() {
  const store = await cookies();
  const locale = (store.get("locale")?.value ?? "fa") as "fa" | "en";
  const t = (fa: string, en: string) => (locale === "fa" ? fa : en);

  const me = await api.get("/auth/me");

  return (
    <div>
      <PageHeader title={t("چت با بیمار", "Chat with patients")} subtitle={t("با ترجمه هوشمند", "With AI translation")} />
      <ChatUI locale={locale} myUserId={me.user.id} />
    </div>
  );
}