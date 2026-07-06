import type { Metadata } from "next";
import { Inter, Fraunces, Noto_Sans_Devanagari, Noto_Sans_Gujarati } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { brand } from "@/lib/brand";
import { stripGatedPricing } from "@/lib/i18n-gate";
import "./globals.css";

const sans = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const serif = Fraunces({
  subsets: ["latin"],
  variable: "--font-serif",
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
    "Track cases by CNR, get tomorrow's cause list on WhatsApp before 8pm, and run your whole practice — built for Indian courts.",
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
  const fontVars = `${sans.variable} ${serif.variable} ${notoDeva.variable} ${notoGuj.variable}`;
  return (
    <html lang={locale} className={fontVars}>
      <body>
        <NextIntlClientProvider messages={messages}>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
