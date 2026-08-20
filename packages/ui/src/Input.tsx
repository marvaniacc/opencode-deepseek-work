import React from "react";
import { cn } from "./utils";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, hint, error, id, ...props }, ref) => (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={id} className="text-[13px] font-medium text-[var(--fg-muted)]">
          {label}
        </label>
      )}
      <input
        ref={ref}
        id={id}
        className={cn(
          "h-10 w-full rounded-[var(--radius-sm)] border bg-[var(--bg)] px-3 text-sm text-[var(--fg)]",
          "placeholder:text-[var(--fg-subtle)] transition-colors",
          "focus:outline-none focus:ring-2 focus:ring-[var(--accent)]",
          error ? "border-[var(--danger)]" : "border-[var(--border)] hover:border-[var(--border-strong)]",
          className
        )}
        {...props}
      />
      {error ? (
        <span className="text-xs text-[var(--danger)]">{error}</span>
      ) : hint ? (
        <span className="text-xs text-[var(--fg-subtle)]">{hint}</span>
      ) : null}
    </div>
  )
);
Input.displayName = "Input";

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, label, error, id, children, ...props }, ref) => (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={id} className="text-[13px] font-medium text-[var(--fg-muted)]">
          {label}
        </label>
      )}
      <select
        ref={ref}
        id={id}
        className={cn(
          "h-10 w-full rounded-[var(--radius-sm)] border bg-[var(--bg)] px-3 text-sm text-[var(--fg)]",
          "focus:outline-none focus:ring-2 focus:ring-[var(--accent)]",
          error ? "border-[var(--danger)]" : "border-[var(--border)] hover:border-[var(--border-strong)]",
          className
        )}
        {...props}
      >
        {children}
      </select>
      {error && <span className="text-xs text-[var(--danger)]">{error}</span>}
    </div>
  )
);
Select.displayName = "Select";

export function Textarea({
  label,
  error,
  hint,
  className,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string; error?: string; hint?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && <label className="text-[13px] font-medium text-[var(--fg-muted)]">{label}</label>}
      <textarea
        className={cn(
          "w-full rounded-[var(--radius-sm)] border bg-[var(--bg)] px-3 py-2 text-sm text-[var(--fg)]",
          "placeholder:text-[var(--fg-subtle)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]",
          error ? "border-[var(--danger)]" : "border-[var(--border)]",
          className
        )}
        {...props}
      />
      {error ? (
        <span className="text-xs text-[var(--danger)]">{error}</span>
      ) : hint ? (
        <span className="text-xs text-[var(--fg-subtle)]">{hint}</span>
      ) : null}
    </div>
  );
}