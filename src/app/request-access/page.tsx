import type { Metadata } from "next";
import { BrandMark } from "@/components/brand-mark";
import { brand } from "@/lib/brand";
import { Reveal } from "@/app/dashboard/motion";
import { RequestAccessForm } from "./request-form";

// WO-272 — public invite-only intake page. No auth required (middleware guards
// only /dashboard + /portal). Linked from the login panel in place of signup.
// WO-340 — reskinned to the Chambers prototype's request-access form/dialog
// (design-mockups/iteration3/console/landing.tsx + landing-one-front-door.tsx):
// card-surface sheet, mount reveal (ported `Reveal`, prefers-reduced-motion-safe
// via the site-wide media query in globals.css). Restyle only — same fields,
// same handler (./actions.ts, WO-272); see request-form.tsx for the field-level
// changes.
export const metadata: Metadata = { title: "Request access" };

export default function RequestAccessPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-ec-paper px-6 py-12">
      <Reveal className="w-full max-w-md">
        <div className="mb-6 flex items-center gap-2.5">
          <BrandMark size={30} tone="dark" />
          <span className="ec-underline font-display text-2xl font-semibold lowercase tracking-tight text-ec-ink">{brand.name}</span>
        </div>
        <div className="ec-card p-6 sm:p-7">
          <RequestAccessForm />
        </div>
        <p className="mt-6 text-xs text-ec-ink-3">{brand.name} · invite-only preview.</p>
      </Reveal>
    </main>
  );
}
