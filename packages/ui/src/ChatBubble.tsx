import React from "react";
import { cn } from "./utils";

export function ChatBubble({
  mine,
  children,
  footer,
  className,
}: {
  mine?: boolean;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col", mine ? "items-end" : "items-start", className)}>
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
          mine
            ? "rounded-br-md bg-[var(--accent)] text-[var(--accent-fg)]"
            : "rounded-bl-md border border-[var(--border)] bg-[var(--bg-muted)] text-[var(--fg)]"
        )}
      >
        {children}
      </div>
      {footer && <div className="mt-1 px-1 text-xs text-[var(--fg-subtle)]">{footer}</div>}
    </div>
  );
}

export function EmptyState({
  icon = "doc",
  title,
  description,
  action,
}: {
  icon?: "doc" | "chat" | "calendar" | "search";
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--bg-subtle)] text-[var(--fg-subtle)]">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} className="h-5 w-5">
          {icon === "chat" && <path d="M21 12a8.5 8.5 0 0 1-8.5 8.5H4l2-3.5A8.5 8.5 0 1 1 21 12Z" />}
          {icon === "calendar" && (
            <>
              <rect x="3.5" y="5" width="17" height="16" rx="2.5" />
              <path d="M3.5 10h17M8 3v4M16 3v4" />
            </>
          )}
          {icon === "search" && (
            <>
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </>
          )}
          {icon === "doc" && (
            <>
              <path d="M6 3h8l5 5v13H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
              <path d="M14 3v5h5M9 13h6M9 17h4" />
            </>
          )}
        </svg>
      </div>
      <div>
        <p className="text-sm font-medium text-[var(--fg)]">{title}</p>
        {description && <p className="mt-1 text-sm text-[var(--fg-subtle)]">{description}</p>}
      </div>
      {action}
    </div>
  );
}