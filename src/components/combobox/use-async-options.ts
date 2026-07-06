"use client";
import { useEffect, useRef, useState } from "react";
import { type ComboOption, filterOptions } from "./logic";

/**
 * WO-55 · Resolve the option list to render for the current query, from EITHER a static array
 * (filtered client-side) OR an async loader (debounced server search — never fetch-all to client).
 * Async calls are race-guarded: a superseded response is dropped, so fast typing can't flash a
 * stale result set. Loading/error are surfaced so the popup shows honest states.
 */
export function useComboOptions<T extends string | number>(params: {
  query: string;
  options?: ComboOption<T>[];
  loadOptions?: (query: string) => Promise<ComboOption<T>[]>;
  debounceMs?: number;
}): { options: ComboOption<T>[]; loading: boolean; error: boolean } {
  const { query, options, loadOptions, debounceMs = 250 } = params;
  const [remote, setRemote] = useState<ComboOption<T>[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const reqId = useRef(0);

  useEffect(() => {
    if (!loadOptions) return;
    const id = ++reqId.current;
    setLoading(true);
    setError(false);
    const timer = setTimeout(() => {
      loadOptions(query)
        .then((res) => {
          if (id !== reqId.current) return; // a newer query superseded this one — drop it
          setRemote(res);
          setLoading(false);
        })
        .catch(() => {
          if (id !== reqId.current) return;
          setError(true);
          setLoading(false);
        });
    }, debounceMs);
    return () => clearTimeout(timer);
  }, [query, loadOptions, debounceMs]);

  if (loadOptions) return { options: remote, loading, error };
  return { options: filterOptions(options ?? [], query), loading: false, error: false };
}
