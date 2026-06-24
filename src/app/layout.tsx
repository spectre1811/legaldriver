import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LexDriver",
  description: "Legal daily driver — cases, hearings, deadlines, notices, Gmail ingest.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
