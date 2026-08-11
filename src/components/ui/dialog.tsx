"use client";

// WO-340 (baseline) + WO-405 C5 (audit §4.1/§10 PRE-1) — the ONE shared modal/drawer/sheet chrome.
// Started as a plain center modal (`createPortal`, Esc, overlay-click, scroll-lock, transition);
// WO-405 adds:
//   - a `variant` prop ('center' | 'drawer-right' | 'sheet-bottom') so the drawer/sheet patterns
//     already hand-rolled elsewhere (cases-toolbar.tsx's FiltersSheet, doc-viewer-panel.tsx) have
//     ONE real primitive to converge on next time they're touched;
//   - a focus trap (audit A11Y-1, §8) — lifted verbatim from doc-viewer-panel.tsx's own
//     FOCUSABLE/Tab-wrap/restore-on-close logic (WO-401 A3), the one overlay that already got
//     this right;
//   - optional `header` (eyebrow + title + close-X) and `footer` slots, so a new consumer
//     (ConfirmAction) doesn't hand-roll that chrome a fourth time.
//
// Existing consumers (add-client-modal.tsx, request-access-dialog.tsx) pass no `variant`/`header`/
// `footer` — they keep rendering exactly as before, own `children` layout untouched. The one
// visible change for them: the center panel now carries `shadow-ec-3`/`rounded-ec-l` (was
// `shadow-ec-2`/`rounded-ec-m`) per this WO's spec — an elevation bump, not a layout change, and it
// brings them in line with add-case-modal.tsx's own (hand-rolled) `rounded-ec-l`.
//
// NOT migrated by this WO: add-case-modal.tsx (hand-rolled) and the two overlays this generalizes
// (cases-toolbar.tsx, doc-viewer-panel.tsx) keep their own already-working implementations —
// flagged as a follow-up sweep, not force-migrated here (WO-405 scope: build the primitive).

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/icons";

export type DialogVariant = "center" | "drawer-right" | "sheet-bottom";

const FOCUSABLE = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export interface DialogHeader {
  eyebrow?: ReactNode;
  title: ReactNode;
  /** Placed on the title element; used as the dialog's accessible name (aria-labelledby). */
  titleId?: string;
  closeLabel: string;
}

const VARIANT: Record<DialogVariant, {
  z: string; wrap: string; panel: string; hidden: string; shown: string; defaultClassName: string;
}> = {
  center: {
    z: "z-ec-modal",
    wrap: "flex items-start justify-center overflow-y-auto p-4 sm:items-center",
    panel: "relative z-10 w-full rounded-ec-l border border-ec-hair bg-ec-paper shadow-ec-3",
    hidden: "translate-y-2 opacity-0",
    shown: "translate-y-0 opacity-100",
    defaultClassName: "max-w-lg",
  },
  "drawer-right": {
    z: "z-ec-drawer",
    wrap: "",
    panel: "absolute inset-y-0 right-0 flex w-full flex-col border-l border-ec-hair bg-ec-paper shadow-ec-3",
    hidden: "translate-x-6 opacity-0",
    shown: "translate-x-0 opacity-100",
    defaultClassName: "max-w-md",
  },
  "sheet-bottom": {
    z: "z-ec-drawer",
    wrap: "",
    panel: "absolute inset-x-0 bottom-0 flex max-h-[90vh] w-full flex-col rounded-t-ec-l border-t border-ec-hair bg-ec-paper shadow-ec-3",
    hidden: "translate-y-4 opacity-0",
    shown: "translate-y-0 opacity-100",
    defaultClassName: "",
  },
};

export function Dialog({
  open,
  onClose,
  labelledBy,
  variant = "center",
  className,
  header,
  footer,
  children,
}: {
  open: boolean;
  onClose: () => void;
  /** Ignored when `header` is passed — the header slot supplies its own accessible name. */
  labelledBy?: string;
  variant?: DialogVariant;
  className?: string;
  header?: DialogHeader;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const v = VARIANT[variant];
  const titleId = header ? (header.titleId ?? "dialog-title") : labelledBy;
  const isSideVariant = variant !== "center";

  const [shown, setShown] = useState(false);
  const [mounted, setMounted] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => setMounted(true), []);

  // Focus trap (audit A11Y-1, §8): focus moves into the panel on open, Tab/Shift+Tab wraps inside
  // it, Esc closes, and focus returns to whatever triggered the dialog on close.
  useEffect(() => {
    if (!open || !mounted) return;
    restoreFocusRef.current = document.activeElement as HTMLElement | null;
    const raf = requestAnimationFrame(() => setShown(true));
    document.body.style.overflow = "hidden";

    // One tick after mount so the panel's real DOM (incl. any autoFocus form field) exists.
    const focusTimer = setTimeout(() => {
      const panel = panelRef.current;
      const target = panel?.querySelector<HTMLElement>(FOCUSABLE) ?? panel;
      target?.focus();
    }, 0);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { onClose(); return; }
      if (e.key !== "Tab" || !panelRef.current) return;
      const focusables = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(focusTimer);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      setShown(false);
      restoreFocusRef.current?.focus?.();
    };
  }, [open, mounted, onClose]);

  if (!open || !mounted) return null;
  return createPortal(
    <div className={`fixed inset-0 ${v.z} ${v.wrap}`} role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <div
        className={`absolute inset-0 bg-ec-ink/40 backdrop-blur-sm transition-opacity duration-200 ${shown ? "opacity-100" : "opacity-0"}`}
        onClick={onClose}
      />
      <div
        ref={panelRef}
        className={`${v.panel} ${className ?? v.defaultClassName} transition-all duration-200 ease-out ${shown ? v.shown : v.hidden}`}
      >
        {header && (
          <div className="flex items-start justify-between gap-4 border-b border-ec-hair px-5 py-4">
            <div className="min-w-0">
              {header.eyebrow && <p className="ec-label">{header.eyebrow}</p>}
              <h2 id={titleId} className="font-display mt-0.5 text-lg font-medium text-ec-ink">{header.title}</h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label={header.closeLabel}
              className="shrink-0 rounded p-1 text-ec-ink-3 transition hover:bg-ec-paper-3 hover:text-ec-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ec-honey"
            >
              <Icon name="close" className="h-4 w-4" />
            </button>
          </div>
        )}
        {isSideVariant ? <div className="min-h-0 flex-1 overflow-y-auto">{children}</div> : children}
        {footer && <div className="border-t border-ec-hair px-5 py-4">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
