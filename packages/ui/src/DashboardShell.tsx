"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "./utils";
import { Icon, IconName } from "./icons";

export interface SidebarItem {
  key: string;
  label: string;
  href: string;
  icon: IconName;
  badge?: string;
}

export interface DashboardShellProps {
  items: SidebarItem[];
  brand: React.ReactNode;
  activeKey?: string;
  footer?: React.ReactNode;
  topbar?: React.ReactNode;
  children: React.ReactNode;
}

const COLLAPSED_W = "w-[64px]";
const EXPANDED_W = "w-[232px]";
const DESKTOP_SIDEBAR_CLASSES = "w-[64px] hover:w-[232px]";

export function DashboardShell({
  items,
  brand,
  activeKey,
  footer,
  topbar,
  children,
}: DashboardShellProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = React.useState(false);

  const isActive = (item: SidebarItem) =>
    activeKey
      ? item.key === activeKey
      : pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));

  const navList = (
    <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-4">
      {items.map((item) => (
        <Link
          key={item.key}
          href={item.href}
          onClick={() => setMobileOpen(false)}
          className={cn(
            "group/item relative flex h-10 items-center gap-3 rounded-[var(--radius-sm)] px-3 text-sm transition-colors",
            isActive(item)
              ? "bg-[var(--accent-muted)] font-medium text-[var(--accent)]"
              : "text-[var(--fg-muted)] hover:bg-[var(--bg-subtle)] hover:text-[var(--fg)]"
          )}
        >
          <Icon name={item.icon} className="h-[18px] w-[18px]" />
          <span className="whitespace-nowrap opacity-0 transition-opacity duration-200 group-hover:opacity-100">
            {item.label}
          </span>
          {item.badge && (
            <span className="ml-auto rounded-full bg-[var(--accent)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--accent-fg)]">
              {item.badge}
            </span>
          )}
        </Link>
      ))}
    </nav>
  );

  const brandEl = (
    <div className="flex h-16 items-center gap-3 overflow-hidden px-5">
      <div className="shrink-0">{brand}</div>
    </div>
  );

  const footerEl = footer ? (
    <div className="border-t border-[var(--border)] px-3 py-3">{footer}</div>
  ) : null;

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      {/* Mobile topbar */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-[var(--border)] bg-[var(--bg)] px-4 md:hidden">
        <div className="flex items-center gap-3">
          <button
            aria-label="Open menu"
            onClick={() => setMobileOpen(true)}
            className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-sm)] text-[var(--fg-muted)] hover:bg-[var(--bg-subtle)]"
          >
            <Icon name="menu" />
          </button>
          {brand}
        </div>
        {topbar}
      </header>

      {/* Mobile drawer */}
      <div
        className={cn(
          "fixed inset-0 z-50 bg-black/30 transition-opacity md:hidden",
          mobileOpen ? "opacity-100" : "pointer-events-none opacity-0"
        )}
        onClick={() => setMobileOpen(false)}
      />
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex flex-col bg-[var(--bg)] shadow-[var(--shadow-float)] transition-transform duration-200 md:hidden",
          EXPANDED_W,
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {brandEl}
        {navList}
        {footerEl}
      </aside>

      {/* Desktop sidebar — collapsed by default, expands on hover (CSS transition, no unmount) */}
      <aside
        className={cn(
          "group fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-[var(--border)] bg-[var(--bg)] md:flex",
          "transition-all duration-200 ease-out",
          "hover:shadow-[var(--shadow-float)]",
          DESKTOP_SIDEBAR_CLASSES
        )}
      >
        {brandEl}
        {navList}
        {footerEl}
      </aside>

      {/* Main content */}
      <div className="md:pl-[64px]">
        {topbar && (
          <header className="sticky top-0 z-20 hidden h-14 items-center justify-end border-b border-[var(--border)] bg-[var(--bg)]/80 px-6 backdrop-blur md:flex">
            {topbar}
          </header>
        )}
        <main className="mx-auto w-full max-w-5xl px-4 py-8 md:px-8">{children}</main>
      </div>
    </div>
  );
}