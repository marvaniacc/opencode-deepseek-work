import React from "react";
import Link from "next/link";
import { cn } from "./utils";
import { Icon, IconName } from "./icons";

export function AppLogo({ className, dark }: { className?: string; dark?: boolean }) {
  return (
    <span
      className={cn(
        "flex items-center gap-2 text-[15px] font-semibold tracking-tight",
        dark ? "text-white" : "text-[var(--fg)]",
        className
      )}
    >
      <span className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--fg)] text-[var(--bg)]">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
          <path d="M4 4h7v7H4zM13 13h7v7h-7zM13 4h7v4h-7zM4 17h4" strokeLinecap="round" />
        </svg>
      </span>
      WishUBest
    </span>
  );
}

export function SidebarUser({
  name,
  sub,
  logoutHref = "/auth/logout",
}: {
  name: string;
  sub?: string;
  logoutHref?: string;
}) {
  return (
    <div className="flex items-center gap-3 px-2 py-1">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--bg-subtle)] text-xs font-semibold text-[var(--fg-muted)]">
        {name.slice(0, 2).toUpperCase()}
      </span>
      <div className="min-w-0 whitespace-nowrap opacity-0 transition-opacity duration-200 group-hover:opacity-100">
        <p className="truncate text-[13px] font-medium text-[var(--fg)]">{name}</p>
        {sub && <p className="truncate text-xs text-[var(--fg-subtle)]">{sub}</p>}
      </div>
      <Link
        href={logoutHref}
        className="ml-auto hidden rounded-[var(--radius-sm)] p-1.5 text-[var(--fg-subtle)] hover:bg-[var(--bg-subtle)] hover:text-[var(--danger)] group-hover:block"
        title="Sign out"
      >
        <Icon name="logout" className="h-4 w-4" />
      </Link>
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--fg)]">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-[var(--fg-muted)]">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export { Icon };
export type { IconName };