"use client";

// WO-405 C4 (audit §4.4/§10 PRE-4) — the shared localStorage-backed preference hook. Replaces the
// three-way persistence split the audit flagged (cookie for density, a cookie E1 proposed for
// column config, "per user" hand-waved for D4's sidebar width) with one hook every UI preference
// uses. Pure read/write lives in `@/lib/persisted-state` (unit-tested offline); this is just the
// React shell.
//
// SSR-safe by construction: the server render and the FIRST client render both use `initial` (so
// the markup matches — no hydration mismatch), and the real persisted value (if any) replaces it
// right after mount via the effect below. That means a value that differs from `initial` visibly
// applies a beat after paint, not before — an accepted, documented tradeoff (this is a client-only
// preference, not content), not a bug to chase.
import { useCallback, useEffect, useState } from "react";
import { readPersisted, writePersisted } from "@/lib/persisted-state";

export function usePersistedState<T>(
  key: string,
  initial: T,
): [T, (next: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(initial);

  useEffect(() => {
    // Read once per key on mount; a caller passing a fresh `initial` literal every render must
    // not re-clobber an already-hydrated value.
    setValue(readPersisted(key, initial));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `initial` deliberately excluded, see above
  }, [key]);

  const set = useCallback(
    (next: T | ((prev: T) => T)) => {
      setValue((prev) => {
        const resolved = typeof next === "function" ? (next as (prev: T) => T)(prev) : next;
        writePersisted(key, resolved);
        return resolved;
      });
    },
    [key],
  );

  return [value, set];
}
