import type { Metadata } from "next";
import { Work_Sans, Fraunces, IBM_Plex_Mono, Noto_Sans_Devanagari, Noto_Sans_Gujarati } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { brand } from "@/lib/brand";
import { stripGatedPricing } from "@/lib/i18n-gate";
import "./globals.css";

// v2 UI sans (design-system-v2 §3). Work Sans + Noto Devanagari/Gujarati pairing.
const sans = Work_Sans({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
// WO-344 · load Fraunces as the VARIABLE font with its `opsz` (optical-size) axis, not fixed
// weight cuts. Pinning weights dropped the opsz axis, so serif headings never optically sized
// (font-optical-sizing:auto is the CSS default but needs the axis present) — a key "thin/flat
// headings" cause. The variable font also gives continuous weights the `.display` utility uses.
const serif = Fraunces({
  subsets: ["latin"],
  variable: "--font-serif",
  display: "swap",
  axes: ["opsz"],
});
// v2 mono (design-system-v2 §3) — CNRs, case numbers, dates, ₹ amounts, serials; tabular-nums.
const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
  weight: ["400", "500", "600"],
});
// Vernacular type — first-class, self-hosted at build (no runtime Google calls).
const notoDeva = Noto_Sans_Devanagari({
  subsets: ["devanagari"],
  variable: "--font-noto-deva",
  display: "swap",
  weight: ["400", "500", "600", "700"],
});
const notoGuj = Noto_Sans_Gujarati({
  subsets: ["gujarati"],
  variable: "--font-noto-guj",
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: `${brand.name} — ${brand.tagline.replace(/\.$/, "")}`,
  description:
    "Track cases by CNR, get tomorrow's cause list ready before 8pm, and run your whole practice — built for Indian courts.",
  openGraph: {
    title: `${brand.name} — ${brand.tagline.replace(/\.$/, "")}`,
    description:
      "Cause lists, cases, clients and invoices — synced from the court record by CNR. Built for Indian courts, free to begin.",
    siteName: brand.name,
    locale: "en_IN",
    type: "website",
  },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const messages = stripGatedPricing(await getMessages());
  const fontVars = `${sans.variable} ${serif.variable} ${mono.variable} ${notoDeva.variable} ${notoGuj.variable}`;
  return (
    <html lang={locale} className={fontVars}>
      <body>
        <NextIntlClientProvider messages={messages}>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
