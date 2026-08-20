"use client";

import { useRouter } from "next/navigation";
import { Icon } from "@wishubest/ui";
import { cn } from "@wishubest/ui";

export function LocaleSwitcher({ locale, className }: { locale: "fa" | "en"; className?: string }) {
  const router = useRouter();
  const next = locale === "fa" ? "en" : "fa";

  const switchLocale = () => {
    document.cookie = `locale=${next}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
    router.refresh();
  };

  return (
    <button
      onClick={switchLocale}
      className={cn(
        "inline-flex h-9 items-center gap-1.5 rounded-[var(--radius-sm)] px-3 text-[13px] font-medium text-[var(--fg-muted)] transition-colors hover:bg-[var(--bg-subtle)] hover:text-[var(--fg)]",
        className
      )}
      aria-label="Switch language"
    >
      <Icon name="globe" className="h-4 w-4" />
      {next === "fa" ? "فارسی" : "EN"}
    </button>
  );
}