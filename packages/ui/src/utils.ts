import { clsx } from "clsx";

export { clsx };

export function cn(...inputs: Parameters<typeof clsx>): string {
  return clsx(inputs);
}

export function formatMoney(minor: number, symbol = "$"): string {
  const sign = minor < 0 ? "-" : "";
  const abs = Math.abs(minor);
  const whole = Math.floor(abs / 100).toString();
  const frac = String(abs % 100).padStart(2, "0");
  return `${sign}${symbol}${whole}.${frac}`;
}

export function formatDate(iso: string | Date, locale = "en"): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return new Intl.DateTimeFormat(locale === "fa" ? "fa-IR" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(d);
}

export function relativeTime(iso: string | Date, locale = "en"): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  const rtf = new Intl.RelativeTimeFormat(locale === "fa" ? "fa" : "en", { numeric: "auto" });
  const diff = d.getTime() - Date.now();
  const abs = Math.abs(diff);
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ["year", 31536000000],
    ["month", 2592000000],
    ["week", 604800000],
    ["day", 86400000],
    ["hour", 3600000],
    ["minute", 60000],
    ["second", 1000],
  ];
  for (const [unit, ms] of units) {
    if (abs >= ms || unit === "second") {
      return rtf.format(Math.round(diff / ms), unit);
    }
  }
  return rtf.format(0, "second");
}