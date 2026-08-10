"use client";

// WO-340 — shared modal chrome (role=dialog · aria-modal · Esc-to-close ·
// overlay-click-close · body-scroll-lock · entrance transition), extracted from the
// pattern already duplicated by hand in add-client-modal.tsx / add-case-modal.tsx so
// the request-access dialog (a 3rd copy) doesn't fork it again. Future modals should
// compose THIS instead of re-writing the wrapper.
//
// Portals to `document.body`: render-inspection caught a real bug otherwise — the
// marketing nav's trigger sits inside a `backdrop-blur` header, and `backdrop-filter`
// establishes a containing block for `position: fixed` descendants (same as
// `transform`/`filter`), so an un-portaled dialog pinned itself to the ~70px header box
// instead of the viewport. Portaling sidesteps that class of bug wherever this mounts.

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export function Dialog({
  open,
  onClose,
  labelledBy,
  className = "max-w-lg",
  children,
}: {
  open: boolean;
  onClose: () => void;
  labelledBy?: string;
  className?: string;
  children: ReactNode;
}) {
  const [shown, setShown] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const raf = requestAnimationFrame(() => setShown(true));
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      setShown(false);
    };
  }, [open, onClose]);

  if (!open || !mounted) return null;
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
    >
      <div
        className={`absolute inset-0 bg-ec-ink/40 backdrop-blur-sm transition-opacity duration-200 ${shown ? "opacity-100" : "opacity-0"}`}
        onClick={onClose}
      />
      <div
        className={`relative z-10 w-full ${className} rounded-ec-m border border-ec-hair bg-ec-paper shadow-ec-2 transition-all duration-200 ease-out ${shown ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"}`}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
