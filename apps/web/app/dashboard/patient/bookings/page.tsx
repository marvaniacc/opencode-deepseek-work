import { cookies } from "next/headers";
import { api } from "@/lib/api";
import { PageHeader } from "@wishubest/ui";
import { BookingsView } from "@/components/BookingsView";

export const dynamic = "force-dynamic";

export default async function PatientBookingsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const store = await cookies();
  const locale = (store.get("locale")?.value ?? "fa") as "fa" | "en";
  const t = (fa: string, en: string) => (locale === "fa" ? fa : en);
  const params = await searchParams;

  const qs = params.status ? `?status=${params.status}` : "";
  const { bookings } = await api.get(`/bookings${qs}`);
  const symbol = bookings?.[0]?.currencyCode === "USD" ? "$" : "$";

  return (
    <div>
      <PageHeader title={t("رزروهای من", "My bookings")} subtitle={t("وضعیت رزرو و پرداخت", "Booking & payment status")} />
      <BookingsView bookings={bookings ?? []} role="patient" locale={locale} symbol={symbol} />
    </div>
  );
}