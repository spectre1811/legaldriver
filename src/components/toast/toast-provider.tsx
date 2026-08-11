"use client";

// WO-405 C2 (audit §4.2/§10 PRE-2) — the app's ONE toast system. Mounted once in the dashboard
// layout; every mutation calls `useToast()`'s `toast(...)` instead of inventing another inline
// success/error banner (the audit found six different ad hoc feedback patterns — A2's green banner,
// the profile-save banner, ConfirmDelete's inline error, …). Bottom-center stack, dark-ink Chambers
// chrome (bg-ec-ink/text-ec-paper, honey action link — matches UndoToast's existing palette),
// auto-dismiss with a progress bar, Undo-capable via `action`. `role="status"`/`aria-live="polite"`
// so a screen reader announces it without stealing focus (unlike a modal). Portals to
// `document.body` for the same reason Dialog does (WO-340): a `fixed` descendant of a
// `backdrop-filter`/`transform` ancestor pins to that ancestor's box, not the viewport.
//
// Queue algebra lives in ./logic.ts (unit-tested offline, no DOM). This file is just the React
// shell: context, per-toast auto-dismiss timer, and the stack's chrome.
//
// Existing overlays (UndoToast in src/components/selection/) are NOT migrated onto this by this
// WO — they're a different, already-shipped pattern (inline bulk-undo pill) and force-migrating
// every consumer is explicitly out of scope here (follow-up sweep). Placed at `bottom-6` (vs.
// UndoToast's `bottom-24`) so the two don't visually collide if both are ever on-screen at once.
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/icons";
import { addToast, removeToast, type ToastInput, type ToastItem, type ToastVariant } from "./logic";

type ToastFn = (input: ToastInput) => string;

const ToastContext = createContext<ToastFn | null>(null);

/** `const toast = useToast(); toast({ title: "Case deleted", variant: "success", action: {...} });` */
export function useToast(): ToastFn {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast() must be called under <ToastProvider> (see dashboard/layout.tsx)");
  return ctx;
}

const VARIANT_DOT: Record<ToastVariant, string> = {
  default: "bg-ec-honey",
  success: "bg-ec-success",
  error: "bg-ec-danger",
};

function ToastRow({ item, onDismiss }: { item: ToastItem; onDismiss: (id: string) => void }) {
  const t = useTranslations("common.actions");
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setShown(true));
    // The real dismiss timer — independent of the progress bar's CSS transition below, so
    // prefers-reduced-motion (which the site-wide override zeroes transition-duration for) never
    // changes WHEN a toast actually disappears, only whether the bar visibly animates doing it.
    const timer = setTimeout(() => onDismiss(item.id), item.durationMs);
    return () => { cancelAnimationFrame(raf); clearTimeout(timer); };
  }, [item.id, item.durationMs, onDismiss]);

  return (
    <div
      role="status"
      aria-live="polite"
      className={`pointer-events-auto flex w-[min(380px,calc(100vw-2rem))] items-start gap-3 overflow-hidden rounded-ec-m bg-ec-ink px-4 py-3 text-ec-paper shadow-ec-3 transition-all duration-200 ease-out ${shown ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"}`}
    >
      <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${VARIANT_DOT[item.variant]}`} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-[13.5px] font-medium leading-snug">{item.title}</p>
        {item.description && <p className="mt-0.5 text-[12.5px] leading-snug text-ec-paper/75">{item.description}</p>}
        {item.action && (
          <button
            type="button"
            onClick={() => { item.action!.onClick(); onDismiss(item.id); }}
            className="mt-1.5 text-[12.5px] font-medium text-ec-honey hover:underline"
          >
            {item.action.label}
          </button>
        )}
        <div className="mt-2 h-[2px] w-full overflow-hidden rounded-full bg-ec-paper/15" aria-hidden="true">
          <div
            className="h-full bg-ec-paper/40 transition-[width] ease-linear"
            style={{ width: shown ? "0%" : "100%", transitionDuration: `${item.durationMs}ms` }}
          />
        </div>
      </div>
      <button
        type="button"
        onClick={() => onDismiss(item.id)}
        aria-label={t("dismiss")}
        className="shrink-0 rounded p-0.5 text-ec-paper/60 transition hover:bg-ec-paper/10 hover:text-ec-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ec-honey"
      >
        <Icon name="close" className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const dismiss = useCallback((id: string) => {
    setItems((list) => removeToast(list, id));
  }, []);

  const toast = useCallback<ToastFn>((input) => {
    let id = "";
    setItems((list) => {
      const result = addToast(list, input);
      id = result.id;
      return result.list;
    });
    return id;
  }, []);

  return (
    <ToastContext.Provider value={toast}>
      {children}
      {mounted &&
        items.length > 0 &&
        createPortal(
          <div className="pointer-events-none fixed inset-x-0 bottom-6 z-ec-toast flex flex-col items-center gap-2 px-4">
            {items.map((item) => (
              <ToastRow key={item.id} item={item} onDismiss={dismiss} />
            ))}
          </div>,
          document.body,
        )}
    </ToastContext.Provider>
  );
}
