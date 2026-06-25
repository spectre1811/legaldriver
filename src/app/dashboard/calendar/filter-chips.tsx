"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import type { Kind } from "./kinds";
import { KIND_STYLE, KIND_LABEL, KIND_ORDER } from "./kinds";

// Event-type filter chips. The active set is encoded in `?types=` (comma-
// separated). All-on is represented by the absence of the param; toggling the
// last-remaining type back on clears the param so the default reads cleanly.
export function FilterChips({ active }: { active: Kind[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const activeSet = new Set(active);

  function toggle(k: Kind) {
    const next = new Set(activeSet);
    if (next.has(k)) next.delete(k);
    else next.add(k);

    const sp = new URLSearchParams(params.toString());
    // All selected → drop the param (clean default). Otherwise encode the
    // selection; "none" is the explicit all-off sentinel (no kind matches it).
    if (next.size === KIND_ORDER.length) sp.delete("types");
    else if (next.size === 0) sp.set("types", "none");
    else sp.set("types", KIND_ORDER.filter((x) => next.has(x)).join(","));
    router.push(`${pathname}?${sp.toString()}`, { scroll: false });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {KIND_ORDER.map((k) => {
        const on = activeSet.has(k);
        return (
          <button
            key={k}
            type="button"
            onClick={() => toggle(k)}
            aria-pressed={on}
            className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition ${
              on
                ? "border-line bg-paper text-ink shadow-sm"
                : "border-transparent bg-paper/40 text-ink-faint hover:text-ink-muted"
            }`}
          >
            <span className={`inline-block h-2.5 w-2.5 rounded-sm ${on ? KIND_STYLE[k].dot : "bg-line"}`} />
            {KIND_LABEL[k]}
          </button>
        );
      })}
    </div>
  );
}
