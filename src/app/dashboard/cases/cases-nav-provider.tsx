"use client";

// WO-147 W2 (slice 2) · Owns the ONE shared filter-nav transition and exposes it via context, so a
// single `isPending` covers every filter control. Kept separate from cases-nav.ts (which stays a
// JSX-free .ts — several guard tests read it by that exact path) because the Provider needs JSX.
import type { ReactNode } from "react";
import { CasesNavContext, useBuildCasesNav, useCasesNav } from "./cases-nav";

export function CasesNavProvider({ children }: { children: ReactNode }) {
  const nav = useBuildCasesNav();
  return <CasesNavContext.Provider value={nav}>{children}</CasesNavContext.Provider>;
}

// Dims + aria-busy's the results region while a filter change is in flight (the soft-nav refetch),
// so the list reads as "updating" without a layout-shifting spinner or a full skeleton swap.
export function PendingDim({ children }: { children: ReactNode }) {
  const { isPending } = useCasesNav();
  return (
    <div aria-busy={isPending} className={`transition-opacity duration-200 ${isPending ? "pointer-events-none opacity-60" : ""}`}>
      {children}
    </div>
  );
}
