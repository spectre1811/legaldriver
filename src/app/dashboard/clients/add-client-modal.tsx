"use client";

// WO-333 · Chambers reskin — the "+ Add client" trigger + modal. Mirrors the established
// add-case-modal.tsx dialog convention (role=dialog · aria-modal · Esc · overlay-close ·
// body-scroll-lock · X button) so the surface stays consistent across the dashboard.
// The intake FORM itself (ClientIntake — conflict check, fields, server action) is reused
// UNCHANGED; this file only supplies the chrome around it.
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/icons";
import { ClientIntake } from "./client-intake";

export function AddClientButton({ practiceAreas }: { practiceAreas: { id: string; name: string }[] }) {
  const t = useTranslations("dashboard.clients");
  const [open, setOpen] = useState(false);
  // Entrance transition (backdrop fade + panel rise), mirroring the reference's
  // `animate-in fade-in` / `slide-in-from-bottom`. Plain CSS transitions on the existing
  // motion tokens (tokens.css `--motion-base`/`--ease`, consumed via Tailwind's `duration-`/
  // `ease-` utilities below) — no animation library needed. `prefers-reduced-motion` is
  // already handled globally (globals.css collapses every transition/animation to ~0).
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (!open) return;
    const raf = requestAnimationFrame(() => setShown(true));
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { cancelAnimationFrame(raf); document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [open]);

  const close = () => { setShown(false); setOpen(false); };

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="ec-btn ec-btn-ink shrink-0 px-3.5 py-2 text-xs">
        <Icon name="plus" className="h-3.5 w-3.5" /> {t("addClient")}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="add-client-title">
          <div
            className={`absolute inset-0 bg-ec-ink/40 transition-opacity duration-200 ${shown ? "opacity-100" : "opacity-0"}`}
            onClick={close}
          />
          <div
            className={`relative z-10 w-full max-w-xl rounded-ec-m border border-ec-hair bg-ec-paper shadow-ec-2 transition-all duration-200 ease-out ${shown ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"}`}
          >
            <div className="flex items-start justify-between border-b border-ec-hair px-5 py-4">
              <div>
                <h2 id="add-client-title" className="font-display text-lg font-medium text-ec-ink">{t("addClientModalTitle")}</h2>
                <p className="mt-0.5 text-xs text-ec-ink-3">{t("addClientModalHelper")}</p>
              </div>
              <button
                type="button"
                onClick={close}
                aria-label={t("close")}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-ec-s text-ec-ink-3 transition hover:bg-ec-paper-3 hover:text-ec-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ec-honey"
              >
                <Icon name="close" className="h-4 w-4" />
              </button>
            </div>
            <div className="max-h-[70vh] overflow-y-auto px-5 py-5">
              <ClientIntake practiceAreas={practiceAreas} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
