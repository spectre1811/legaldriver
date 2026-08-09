"use client";

// WO-324 Daybreak landing — universal search (Cases / Judges & advocates /
// Judgments). No backend yet (WO-326 owns the proxy): Enter/submit hands off to
// search.mukadma.in, exactly like the founder-approved reference
// (design-mockups/iteration3/landing-v6-daybreak.html submitSearch()). Swap the
// handoff for the WO-326 proxy call in one place once it lands.
import { useId, useState } from "react";
import { Icon } from "@/components/icons";
import { useTypewriter } from "./motion";

type Scope = "cases" | "people" | "judgments";

// Example queries for the cycling placeholder only (never submitted, never shown as
// results) — Latin-script query shapes matching real Indian court records, same
// register as the illustrative "Sharma v. State of Gujarat" already on this page.
const EXAMPLE_QUERIES = ["GJHC240196752026", "Justice A. Y. Kogje", "Adv. R. K. Patel", "Sharma v. State of Gujarat"] as const;

export function HeroSearch({
  searchHost,
  tabs,
  placeholder,
  ariaLabel,
  button,
}: {
  searchHost: string;
  tabs: { cases: string; people: string; judgments: string };
  placeholder: string;
  ariaLabel: string;
  button: string;
}) {
  const [scope, setScope] = useState<Scope>("cases");
  const [q, setQ] = useState("");
  const [engaged, setEngaged] = useState(false);
  const groupId = useId();
  const typed = useTypewriter(EXAMPLE_QUERIES, !engaged);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const term = q.trim();
    if (!term) return;
    const path = scope === "people" ? "/people" : "/search";
    const params = new URLSearchParams({ q: term });
    if (scope === "judgments") params.set("type", "judgments");
    window.location.href = `${searchHost}${path}?${params.toString()}`;
  }

  return (
    <div className="mt-8 mk-anim-search">
      <div role="radiogroup" aria-label={ariaLabel} className="mb-3.5 inline-flex gap-0.5 rounded-full border border-ec-hair bg-ec-paper-3 p-1">
        {([["cases", tabs.cases], ["people", tabs.people], ["judgments", tabs.judgments]] as const).map(([val, label]) => (
          <label key={val} className={`cursor-pointer rounded-full px-4 py-2 text-[13px] font-medium transition ${scope === val ? "bg-ec-paper-2 text-ec-ink shadow-ec-1" : "text-ec-ink-3 hover:text-ec-ink-2"}`}>
            <input type="radio" name={`${groupId}-scope`} value={val} checked={scope === val} onChange={() => setScope(val)} className="sr-only" />
            {label}
          </label>
        ))}
      </div>
      <form onSubmit={submit} className="max-w-xl">
        <div className="mk-search-bloom flex items-center gap-3 rounded-full border border-ec-hair bg-ec-paper-2 py-2 pl-5 pr-2 shadow-ec-1">
          <Icon name="search" className="h-5 w-5 flex-none text-ec-bronze-deep" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onFocus={() => setEngaged(true)}
            placeholder={engaged ? placeholder : typed || placeholder}
            aria-label={ariaLabel}
            autoComplete="off"
            className="min-w-0 flex-1 border-0 bg-transparent text-[16px] text-ec-ink outline-none placeholder:text-ec-ink-3"
          />
          <button type="submit" className="ec-btn ec-btn-brass !rounded-full">
            {button} <Icon name="external" className="h-3.5 w-3.5" />
          </button>
        </div>
      </form>
    </div>
  );
}
