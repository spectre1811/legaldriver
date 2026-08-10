"use client";

// WO-340 — the bare /request-access URL still works (every "Request access" link across
// the marketing site points here), but now shows the same <RequestAccessDialog> the login
// panel and the marketing nav open in place, rather than a bespoke full-page layout — the
// Chambers prototype's request-access surface is a dialog, not a page. Closing it returns
// to "/".
import { useRouter } from "next/navigation";
import { RequestAccessDialog } from "@/components/request-access-dialog";

export function RequestAccessOverlay() {
  const router = useRouter();
  return <RequestAccessDialog open onClose={() => router.push("/")} />;
}
