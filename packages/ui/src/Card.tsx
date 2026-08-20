import React from "react";
import { cn } from "./utils";

export function Card({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg)] p-6",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  subtitle,
  action,
  className,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-5 flex items-start justify-between gap-4", className)}>
      <div className="space-y-1">
        <h3 className="text-base font-semibold text-[var(--fg)]">{title}</h3>
        {subtitle && <p className="text-sm text-[var(--fg-muted)]">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

type BadgeTone = "neutral" | "accent" | "success" | "danger" | "warning";

const badgeTones: Record<BadgeTone, string> = {
  neutral: "bg-[var(--bg-subtle)] text-[var(--fg-muted)]",
  accent: "bg-[var(--accent-muted)] text-[var(--accent)]",
  success: "bg-[var(--success-muted)] text-[var(--success)]",
  danger: "bg-[var(--danger-muted)] text-[var(--danger)]",
  warning: "bg-[var(--warning-muted)] text-[var(--warning)]",
};

export function Badge({
  tone = "neutral",
  className,
  children,
}: {
  tone?: BadgeTone;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium",
        badgeTones[tone],
        className
      )}
    >
      {children}
    </span>
  );
}

export function statusTone(status: string): BadgeTone {
  switch (status) {
    case "active":
    case "approved":
    case "confirmed":
    case "completed":
    case "paid":
    case "succeeded":
    case "verified":
      return "success";
    case "pending":
    case "requested":
    case "awaiting_payment":
    case "issued":
      return "warning";
    case "cancelled":
    case "rejected":
    case "failed":
    case "disabled":
    case "suspended":
      return "danger";
    default:
      return "neutral";
  }
}

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  const text =
    label ??
    status
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
  return <Badge tone={statusTone(status)}>{text}</Badge>;
}