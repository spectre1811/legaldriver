"use client";

// WO-340 — the marketing nav's "Request access" CTA opens the dialog in place
// (design-mockups/iteration3/console/landing-one-front-door.tsx's <DialogTrigger>)
// instead of navigating to /request-access. Every other "Request access" link on this
// page (pricing tiers, closing band, live-card) stays a plain link to the bare URL,
// which now renders that same dialog itself (request-access-overlay.tsx) — so nothing
// dead-ends.
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/icons";
import { RequestAccessDialog } from "@/components/request-access-dialog";

export function RequestAccessNavCta() {
  const t = useTranslations("landing");
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="ec-btn ec-btn-ink">
        {t("nav.requestAccess")} <Icon name="chevron" className="h-3.5 w-3.5" />
      </button>
      <RequestAccessDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}
