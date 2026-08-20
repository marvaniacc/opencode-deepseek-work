import React from "react";
import { cn } from "./utils";
import { Icon, IconName } from "./icons";

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
  icon?: IconName;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--bg-subtle)] text-[var(--fg-subtle)]">
        <Icon name={icon} className="h-5 w-5" />
      </div>
      <div>
        <p className="text-sm font-medium text-[var(--fg)]">{title}</p>
        {description && <p className="mt-1 text-sm text-[var(--fg-subtle)]">{description}</p>}
      </div>
      {action}
    </div>
  );
}