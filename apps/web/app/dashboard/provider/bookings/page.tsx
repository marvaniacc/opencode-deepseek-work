import { cookies } from "next/headers";
import { api } from "@/lib/api";
import { PageHeader } from "@wishubest/ui";
import { BookingsView } from "@/components/BookingsView";

export const dynamic = "force-dynamic";

export default async function ProviderBookingsPage() {
  const store = await cookies();
  const locale = (store.get("locale")?.value ?? "fa") as "fa" | "en";
  const t = (fa: string, en: string) => (locale === "fa" ? fa : en);

  const { bookings } = await api.get("/bookings");
  const symbol = "$";

  return (
    <div>
      <PageHeader
        title={t("رزروها", "Bookings")}
        subtitle={t("تایید، تکمیل یا لغو رزروها", "Confirm, complete or cancel bookings")}
      />
      <BookingsView bookings={bookings ?? []} role="provider" locale={locale} symbol={symbol} />
    </div>
  );
}