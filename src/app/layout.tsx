import type { Metadata } from "next";
import { Inter, Fraunces, Noto_Sans_Devanagari, Noto_Sans_Gujarati } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
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
  title: "Legaldriver — your legal daily driver",
  description: "Cases, hearings, deadlines, notices and inbox for advocates — one daily driver.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const messages = await getMessages();
  const fontVars = `${sans.variable} ${serif.variable} ${notoDeva.variable} ${notoGuj.variable}`;
  return (
    <html lang={locale} className={fontVars}>
      <body>
        <NextIntlClientProvider messages={messages}>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
