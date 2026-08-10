import type { Metadata } from "next";
import { RequestAccessOverlay } from "./request-access-overlay";

// WO-272 — public invite-only intake. No auth required (middleware guards only
// /dashboard + /portal). Linked from the login panel in place of signup.
// WO-340 — founder correction: the earlier reskin wrongly made this a standalone page.
// The Chambers prototype's request-access surface is a <Dialog>
// (design-mockups/iteration3/console/landing-one-front-door.tsx), so the URL now renders
// that same dialog over the site background instead of a bespoke card layout. Same
// fields, same handler (./actions.ts, WO-272) — see request-access-dialog.tsx +
// request-form.tsx for the surface itself.
export const metadata: Metadata = { title: "Request access" };

export default function RequestAccessPage() {
  return (
    <main className="min-h-screen bg-ec-paper">
      <RequestAccessOverlay />
    </main>
  );
}
