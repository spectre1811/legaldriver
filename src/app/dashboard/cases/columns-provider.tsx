"use client";

// WO-412 E1 fix · Shared column-visibility state for the Cases table.
//
// Root cause of the "add columns is still wrong" report: the ColumnPicker trigger (WO-407) lived
// as the LAST <th> inside cases-table.tsx's own `overflow-x-auto` scroller. Live render-inspect
// (1440/1024/768) showed the trigger's bounding box sitting past the scroller's visible right edge
// at BOTH 1024 and 768 (only 1440 happened to be wide enough for the table to fit without
// overflowing) — reachable only by first discovering you need to scroll a table you don't already
// know is scrollable. The fix (per the founder's own hypothesis) is to move the trigger out of the
// scrolling region into the toolbar's always-visible command row.
//
// That means the trigger (cases-toolbar.tsx) and the columns it controls (cases-table.tsx) are now
// SIBLINGS, not parent/child, so the persisted ColumnsState can no longer live as local state inside
// cases-table.tsx (WO-407's original shape) — it needs one shared owner above both, same pattern as
// <CasesNavProvider> (cases-nav-provider.tsx) already uses for the URL-nav transition. This is that
// provider, scoped to just the columns concern (kept OUT of cases-nav.ts, which stays "the one place
// the Cases list mutates its URL" — columns are a localStorage preference, not a URL axis).
import { createContext, useContext, type ReactNode } from "react";
import { usePersistedState } from "@/lib/hooks/use-persisted-state";
import { COLUMNS_STORAGE_KEY, DEFAULT_COLUMNS_STATE, parseColumnsState, type ColumnsState } from "./columns";

type CasesColumnsCtx = {
  columns: ColumnsState;
  setColumns: (next: ColumnsState) => void;
};

const CasesColumnsContext = createContext<CasesColumnsCtx | null>(null);

export function CasesColumnsProvider({ children }: { children: ReactNode }) {
  const [storedColumns, setStoredColumns] = usePersistedState<ColumnsState>(COLUMNS_STORAGE_KEY, DEFAULT_COLUMNS_STATE);
  // parseColumnsState repairs a corrupt/stale/schema-drifted stored value (same discipline as
  // parseDensity) — usePersistedState itself doesn't validate shape (use-persisted-state.ts).
  const columns = parseColumnsState(storedColumns);
  return (
    <CasesColumnsContext.Provider value={{ columns, setColumns: setStoredColumns }}>
      {children}
    </CasesColumnsContext.Provider>
  );
}

export function useCasesColumns(): CasesColumnsCtx {
  const ctx = useContext(CasesColumnsContext);
  if (!ctx) throw new Error("useCasesColumns must be used within <CasesColumnsProvider>");
  return ctx;
}
