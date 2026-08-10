"use client";

// WO-339/340 — the Chambers prototype's request-access surface is a <Dialog>, not a
// standalone page (design-mockups/iteration3/console/landing-one-front-door.tsx: <Dialog>
// <DialogTrigger>Request access</DialogTrigger><DialogContent>…<RequestAccessForm/></Dialog>).
// One component, reused wherever a "Request access" CTA appears (the login panel's link,
// the marketing nav button, the bare /request-access URL). The intake form + its submit
// handler (./request-access/request-form.tsx + actions.ts, WO-272) are UNCHANGED — this
// only supplies the modal chrome around it.

import { useTranslations } from "next-intl";
import { Icon } from "@/components/icons";
import { Dialog } from "@/components/ui/dialog";
import { RequestAccessForm } from "@/app/request-access/request-form";

export function RequestAccessDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTranslations("requestAccess");
  return (
    <Dialog open={open} onClose={onClose} labelledBy="request-access-title">
      <button
        type="button"
        onClick={onClose}
        aria-label={t("close")}
        className="absolute right-4 top-4 z-10 flex h-8 w-8 items-center justify-center rounded-ec-s text-ec-ink-3 transition hover:bg-ec-paper-3 hover:text-ec-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ec-honey"
      >
        <Icon name="close" className="h-4 w-4" />
      </button>
      <div className="max-h-[85vh] overflow-y-auto p-5 sm:p-6">
        <RequestAccessForm />
      </div>
    </Dialog>
  );
}
