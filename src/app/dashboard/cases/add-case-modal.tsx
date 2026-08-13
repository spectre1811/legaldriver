"use client";

// WO-147 W2 (slice 2) · The "+ Add case" trigger + its modal. Frees the always-open Add-case card
// from the top of the list (blueprint §7: "Add-by-CNR moves into the + Add case modal"). Mirrors
// the FiltersSheet dialog pattern already in cases-toolbar.tsx (role=dialog · aria-modal · Esc ·
// overlay-close · body-scroll-lock · X button) so the surface stays consistent.
// Auto-opens when a ?track=<CNR> deep link arrives (post-login "track this case"), so the form
// mounts and auto-submits exactly as it did in the old always-open card.
// WO-346 exact-fidelity reconcile vs. design-mockups/iteration3/console/cases.tsx's Add-a-case
// modal: an eyebrow ("New matter") above the title, no header helper line (the "we pull…" copy
// moved into the form body, next to the CNR field it explains) — see add-case-form.tsx for the
// CNR/manual field + footer layout.

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/icons";
import { AddCaseForm } from "./add-case-form";
import { useCasesNav } from "./cases-nav";

export function AddCaseButton({
  autoCnr, autoOpen, courts = [],
}: { autoCnr?: string; autoOpen?: boolean; courts?: string[] }) {
  const t = useTranslations("cases");
  const { sp, setParam } = useCasesNav();
  // Open immediately on first render for a deep-linked CNR (?track=, auto-submits) OR the
  // top-bar "+ New" (?add=1, opens the empty form focused). Same pattern, one state.
  const [open, setOpen] = useState(() => Boolean(autoCnr) || Boolean(autoOpen));

  // WO-401 A1 — a same-route click (e.g. "+ New case" from the top bar while ALREADY on
  // /dashboard/cases) only changes the `?add=1` param; the useState initializer above only runs
  // on mount, so without this effect a repeat click silently did nothing (the exact bug: the
  // button "does nothing" once you're already on the Cases page).
  useEffect(() => {
    if (autoOpen) setOpen(true);
  }, [autoOpen]);

  const close = () => {
    setOpen(false);
    // Strip `add` so the URL returns to a clean state — otherwise a repeat "+ New case" click
    // (same href, same URL) is a no-op navigation and the effect above never re-fires.
    if (sp.get("add")) setParam("add", "");
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- close() is stable enough here (sp/setParam come from context)
  }, [open]);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="ec-btn ec-btn-ink px-3 py-2 text-xs">
        <Icon name="plus" className="h-3.5 w-3.5" /> {t("add.cta")}
      </button>

      {open && (
        <div className="fixed inset-0 z-ec-modal flex items-start justify-center overflow-y-auto p-4 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="add-case-title">
          <div className="absolute inset-0 bg-ec-ink/40 backdrop-blur-sm" onClick={close} />
          <div className="relative z-10 w-full max-w-md rounded-ec-l border border-ec-hair bg-ec-paper shadow-ec-2">
            <div className="flex items-start justify-between border-b border-ec-hair px-5 py-4">
              <div className="min-w-0">
                <p className="ec-label">{t("add.eyebrow")}</p>
                <h2 id="add-case-title" className="font-display mt-0.5 text-lg font-medium text-ec-ink">{t("add.modalTitle")}</h2>
              </div>
              <button type="button" onClick={close} aria-label={t("add.close")} className="shrink-0 rounded p-1 text-ec-ink-3 transition hover:bg-ec-paper-3 hover:text-ec-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ec-honey">
                <Icon name="close" className="h-4 w-4" />
              </button>
            </div>
            <div className="px-5 py-4">
              <AddCaseForm autoCnr={autoCnr} autoFocus courts={courts} onCancel={close} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
