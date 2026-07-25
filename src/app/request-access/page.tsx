import type { Metadata } from "next";
import { BrandMark } from "@/components/brand-mark";
import { brand } from "@/lib/brand";
import { RequestAccessForm } from "./request-form";

// WO-272 — public invite-only intake page. No auth required (middleware guards
// only /dashboard + /portal). Linked from the login panel in place of signup.
export const metadata: Metadata = { title: "Request access" };

export default function RequestAccessPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-ec-paper px-6 py-12">
      <div className="w-full max-w-sm animate-fade-in">
        <div className="mb-8 flex items-center gap-2.5">
          <BrandMark size={30} tone="dark" />
          <span className="ec-underline font-display text-2xl font-semibold lowercase tracking-tight text-ec-ink">{brand.name}</span>
        </div>
        <RequestAccessForm />
        <p className="mt-8 text-xs text-ec-ink-3">{brand.name} · invite-only preview.</p>
      </div>
    </main>
  );
}
