import React from "react";
import { cn } from "./utils";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "success";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
  primary: "bg-[var(--accent)] text-[var(--accent-fg)] hover:opacity-90 active:opacity-80",
  secondary: "bg-[var(--bg-subtle)] text-[var(--fg)] border border-[var(--border)] hover:bg-[var(--bg-muted)]",
  ghost: "text-[var(--fg-muted)] hover:bg-[var(--bg-subtle)] hover:text-[var(--fg)]",
  danger: "bg-[var(--danger)] text-white hover:opacity-90",
  success: "bg-[var(--success)] text-white hover:opacity-90",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-[13px] rounded-[var(--radius-sm)] gap-1.5",
  md: "h-10 px-4 text-sm rounded-[var(--radius)] gap-2",
  lg: "h-12 px-6 text-[15px] rounded-[var(--radius)] gap-2",
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", loading, disabled, children, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center font-medium transition-colors select-none",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        variants[variant],
        sizes[size],
        className
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <Spinner className="h-4 w-4" />}
      {children}
    </button>
  )
);
Button.displayName = "Button";

export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cn("animate-spin", className)} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}