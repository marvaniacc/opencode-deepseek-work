import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { api } from "@/lib/api";
import { DashboardShell, AppLogo, SidebarUser } from "@wishubest/ui";
import { LocaleSwitcher } from "@/components/LocaleSwitcher";
import { NotificationsBell } from "@/components/NotificationsBell";

export const dynamic = "force-dynamic";

const NAV: Record<string, Array<{ key: string; label: string; href: string; icon: any }>> = {
  patient: [
    { key: "bookings", label: "Bookings", href: "/dashboard/patient/bookings", icon: "calendar" },
    { key: "chat", label: "Chat", href: "/dashboard/patient/chat", icon: "chat" },
    { key: "documents", label: "Documents", href: "/dashboard/patient/documents", icon: "doc" },
    { key: "reviews", label: "Reviews", href: "/dashboard/patient/reviews", icon: "star" },
  ],
  provider: [
    { key: "overview", label: "Overview", href: "/dashboard/provider", icon: "home" },
    { key: "bookings", label: "Bookings", href: "/dashboard/provider/bookings", icon: "calendar" },
    { key: "services", label: "Services & Locations", href: "/dashboard/provider/services", icon: "building" },
    { key: "kyc", label: "Onboarding & KYC", href: "/dashboard/provider/kyc", icon: "shield" },
    { key: "chat", label: "Chat", href: "/dashboard/provider/chat", icon: "chat" },
    { key: "documents", label: "Patient Documents", href: "/dashboard/provider/documents", icon: "file" },
    { key: "reviews", label: "Reviews", href: "/dashboard/provider/reviews", icon: "star" },
  ],
  admin: [
    { key: "overview", label: "Overview", href: "/dashboard/admin", icon: "home" },
    { key: "geo", label: "Countries & Cities", href: "/dashboard/admin/geo", icon: "globe" },
    { key: "currency", label: "Currency", href: "/dashboard/admin/currency", icon: "currency" },
    { key: "users", label: "Users", href: "/dashboard/admin/users", icon: "users" },
    { key: "providers", label: "Providers & KYC", href: "/dashboard/admin/providers", icon: "shield" },
    { key: "ai", label: "AI Translation", href: "/dashboard/admin/ai", icon: "translate" },
    { key: "reviews", label: "Reviews", href: "/dashboard/admin/reviews", icon: "star" },
    { key: "ledger", label: "Ledger", href: "/dashboard/admin/ledger", icon: "creditCard" },
    { key: "audit", label: "Audit Log", href: "/dashboard/admin/audit", icon: "lock" },
  ],
};

export default async function DashboardLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ role: string }>;
}) {
  const { role } = await params;
  const store = await cookies();
  const locale = (store.get("locale")?.value ?? "fa") as "fa" | "en";
  const t = (fa: string, en: string) => (locale === "fa" ? fa : en);

  let me: any = null;
  try {
    me = await api.get("/auth/me");
  } catch {
    // not authenticated
  }
  if (!me?.user) {
    redirect(`/auth/login?next=/dashboard/${role}`);
  }
  const user = me.user;
  if (user.role !== role) {
    redirect(`/dashboard/${user.role}`);
  }

  const items = NAV[role] ?? [];
  const profileName =
    user.patientProfile?.firstName
      ? `${user.patientProfile.firstName} ${user.patientProfile.lastName}`
      : user.providerProfile?.specialty
        ? `${user.providerProfile.title ?? ""} ${user.providerProfile.specialty}`
        : user.adminProfile?.fullName ?? user.email;

  return (
    <DashboardShell
      items={items.map((i) => ({ ...i, label: t(i.label, i.label), icon: i.icon }))}
      brand={<AppLogo />}
      footer={<SidebarUser name={profileName} sub={user.email} />}
      topbar={
        <div className="flex items-center gap-2">
          <NotificationsBell role={role} locale={locale} />
          <LocaleSwitcher locale={locale} />
        </div>
      }
    >
      {children}
    </DashboardShell>
  );
}