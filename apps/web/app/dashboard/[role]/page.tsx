import { redirect } from "next/navigation";

const DEFAULTS: Record<string, string> = {
  patient: "/dashboard/patient/bookings",
  provider: "/dashboard/provider/bookings",
  admin: "/dashboard/admin/ai",
};

export default async function RoleHomePage({ params }: { params: Promise<{ role: string }> }) {
  const { role } = await params;
  redirect(DEFAULTS[role] ?? `/dashboard/${role}`);
}