"use client";

// WO-147 W2 · The ONE place the Cases list mutates its URL.
// Replaces the old per-toggle `router.push` (each filter stacked a history entry and forced a full
// server churn — the "filters break / clutter" report) with `router.replace(..., {scroll:false})`:
// a soft nav that keeps the URL contract byte-identical (shareable links + saved views unchanged),
// never stacks history, and runs inside a transition so `isPending` can drive the loading state
// with no layout shift. Every filter control (toolbar, segmented, sheet, attention cards) routes
// through this hook, so the mechanism lives in exactly one file.
//
// W2 slice 2: the transition is now owned ONCE by <CasesNavProvider> (cases-nav-provider.tsx) and
// shared via context, so a single `isPending` covers every control and can dim the whole results
// region (PendingDim) — not per-hook state that only knew about its own navigation.
import { useRouter, useSearchParams, type ReadonlyURLSearchParams } from "next/navigation";
import { createContext, useCallback, useContext, useTransition } from "react";

// A saved view: a named snapshot of the filter query (was defined in the deleted console.tsx).
export type SavedView = { id: string; name: string; query: Record<string, string | string[]> };

// Every param the Cases list understands, order-stable so the URL stays deterministic.
export const CASE_KEYS = ["q", "tier", "court", "case_type", "stage", "status", "statuses", "advocate", "act", "judge", "next", "sort"] as const;
// The multi-valued facets (repeated params, e.g. ?court=A&court=B).
export const CASE_MULTI = new Set<string>(["court", "case_type", "stage", "statuses", "advocate", "act", "judge"]);
// Panel facets (everything the Filters sheet owns) — drives the Filters button's count badge + chips.
export const PANEL_FACETS = ["court", "case_type", "stage", "statuses", "advocate", "act", "judge", "next"] as const;
// The keys a saved view snapshots/restores (the query axes, minus the `tier` court-segment).
export const VIEW_KEYS = ["q", "court", "case_type", "stage", "status", "statuses", "advocate", "act", "judge", "next", "sort"] as const;

export type CasesNav = {
  sp: ReadonlyURLSearchParams;
  isPending: boolean;
  setParam: (key: string, value: string) => void;
  setMulti: (key: string, values: string[]) => void;
  removeValue: (key: string, value: string) => void;
  clearAll: () => void;
  clearPanel: () => void;
  applyQuery: (query: Record<string, string | string[]>) => void;
};

// Built ONCE by <CasesNavProvider>. The single shared transition means `isPending` reflects any
// filter change, so PendingDim can dim the results while the soft-nav refetches.
export function useBuildCasesNav(): CasesNav {
  const router = useRouter();
  const sp = useSearchParams();
  // Transition keeps the current list on screen (no loading flash / layout shift) while the soft-nav
  // refetches; isPending → the shared dim state, exposed through context.
  const [isPending, startTransition] = useTransition();

  // Any filter change returns to page 1 (an old page number is meaningless against a new set).
  const commit = useCallback(
    (next: URLSearchParams) => {
      next.delete("page");
      const qs = next.toString();
      startTransition(() =>
        router.replace(qs ? `/dashboard/cases?${qs}` : "/dashboard/cases", { scroll: false }),
      );
    },
    [router],
  );

  const setParam = useCallback(
    (key: string, value: string) => {
      const next = new URLSearchParams(sp.toString());
      if (value) next.set(key, value);
      else next.delete(key);
      commit(next);
    },
    [sp, commit],
  );

  // Multi-valued facet → repeated params, comma-safe (values can contain commas).
  const setMulti = useCallback(
    (key: string, values: string[]) => {
      const next = new URLSearchParams(sp.toString());
      next.delete(key);
      for (const v of values) next.append(key, v);
      commit(next);
    },
    [sp, commit],
  );

  // Remove one value of a (possibly multi) key — used by chip ✕.
  const removeValue = useCallback(
    (key: string, value: string) => {
      const next = new URLSearchParams(sp.toString());
      const kept = next.getAll(key).filter((v) => v !== value);
      next.delete(key);
      for (const v of kept) next.append(key, v);
      commit(next);
    },
    [sp, commit],
  );

  // Clear every filter (drops the whole query — matches the old "Clear filters" link).
  const clearAll = useCallback(() => {
    startTransition(() => router.replace("/dashboard/cases", { scroll: false }));
  }, [router]);

  // Clear only the panel facets, leaving search + segments (tier/status) intact — the sheet's "Clear all".
  const clearPanel = useCallback(() => {
    const next = new URLSearchParams(sp.toString());
    for (const k of PANEL_FACETS) next.delete(k);
    commit(next);
  }, [sp, commit]);

  // Apply a saved view: replace the whole query with its stored VIEW_KEYS (fresh, not merged).
  const applyQuery = useCallback(
    (query: Record<string, string | string[]>) => {
      const next = new URLSearchParams();
      for (const k of VIEW_KEYS) {
        const val = query[k];
        if (val == null) continue;
        for (const v of Array.isArray(val) ? val : [val]) if (v) next.append(k, v);
      }
      const qs = next.toString();
      startTransition(() => router.replace(qs ? `/dashboard/cases?${qs}` : "/dashboard/cases", { scroll: false }));
    },
    [router],
  );

  return { sp, isPending, setParam, setMulti, removeValue, clearAll, clearPanel, applyQuery };
}

export const CasesNavContext = createContext<CasesNav | null>(null);

// Every filter control reads the shared nav from context (provider owns the one transition).
export function useCasesNav(): CasesNav {
  const ctx = useContext(CasesNavContext);
  if (!ctx) throw new Error("useCasesNav must be used within <CasesNavProvider>");
  return ctx;
}
