import type { Metadata } from "next";
import { Inter, Vazirmatn } from "next/font/google";
import { cookies } from "next/headers";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const vazirmatn = Vazirmatn({ subsets: ["arabic"], variable: "--font-vazirmatn", display: "swap" });

export const metadata: Metadata = {
  title: {
    default: "WishUBest — Find and book doctors",
    template: "%s · WishUBest",
  },
  description:
    "Find a doctor, book a visit (in-person or online), chat with AI translation, and manage your medical documents.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const store = await cookies();
  const locale = (store.get("locale")?.value === "en" ? "en" : "fa") as "fa" | "en";

  return (
    <html lang={locale} dir={locale === "fa" ? "rtl" : "ltr"}>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body
        className={`${inter.variable} ${vazirmatn.variable}`}
        style={{ fontFamily: locale === "fa" ? "var(--font-vazirmatn), var(--font-inter), sans-serif" : "var(--font-inter), var(--font-vazirmatn), sans-serif" }}
      >
        {children}
      </body>
    </html>
  );
}