"use client";

// WO-147 W2 (slice 2) · The "+ Add case" trigger + its modal. Frees the always-open Add-case card
// from the top of the list (blueprint §7: "Add-by-CNR moves into the + Add case modal") — the form
// itself is unchanged (AddCaseForm: CNR paste-first, manual fallback). Mirrors the FiltersSheet
// dialog pattern already in cases-toolbar.tsx (role=dialog · aria-modal · Esc · overlay-close ·
// body-scroll-lock · X button) so the surface stays consistent.
// Auto-opens when a ?track=<CNR> deep link arrives (post-login "track this case"), so the form
// mounts and auto-submits exactly as it did in the old always-open card.

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/icons";
import { AddCaseForm } from "./add-case-form";

export function AddCaseButton({ autoCnr, autoOpen }: { autoCnr?: string; autoOpen?: boolean }) {
  const t = useTranslations("cases");
  // Open immediately on first render for a deep-linked CNR (?track=, auto-submits) OR the
  // top-bar "+ New" (?add=1, opens the empty form focused). Same pattern, one state.
  const [open, setOpen] = useState(() => Boolean(autoCnr) || Boolean(autoOpen));

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [open]);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="ec-btn ec-btn-ink px-3 py-2 text-xs">
        <Icon name="plus" className="h-3.5 w-3.5" /> {t("add.cta")}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="add-case-title">
          <div className="absolute inset-0 bg-ec-ink/40" onClick={() => setOpen(false)} />
          <div className="relative z-10 w-full max-w-md rounded-ec-l border border-ec-hair bg-ec-paper shadow-ec-2">
            <div className="flex items-start justify-between border-b border-ec-hair px-5 py-4">
              <div>
                <h2 id="add-case-title" className="font-display text-lg font-medium text-ec-ink">{t("add.modalTitle")}</h2>
                <p className="mt-0.5 text-xs text-ec-ink-3">{t("add.modalHelper")}</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label={t("add.close")} className="flex h-8 w-8 items-center justify-center rounded-ec-s text-ec-ink-3 transition hover:bg-ec-paper-3 hover:text-ec-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ec-indigo">
                <Icon name="close" className="h-4 w-4" />
              </button>
            </div>
            <div className="px-5 py-4">
              <AddCaseForm autoCnr={autoCnr} autoFocus />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
