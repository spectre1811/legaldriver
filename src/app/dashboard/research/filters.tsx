"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Icon } from "@/components/icons";
import { COURT_NAMES } from "@/lib/court/corpus-athena";

// All 25 High Court codes in the corpus. Labels come from COURT_NAMES when known,
// else fall back to "Court <code>".
const COURT_CODES = [
  "SC",
  "1_12", "2_5", "3_22", "5_15", "7_26", "8_9", "9_13", "10_8", "11_24", "14_25",
  "16_20", "17_21", "18_6", "19_16", "20_7", "21_11", "22_18", "23_23", "24_17",
  "27_1", "28_2", "29_3", "32_4", "33_10", "36_29",
];

const COURTS = COURT_CODES
  .map((code) => ({ value: code, label: COURT_NAMES[code] ?? `Court ${code}` }))
  .sort((a, b) => a.label.localeCompare(b.label));

const YEARS = Array.from({ length: 2026 - 2008 + 1 }, (_, i) => 2026 - i).map((y) => String(y));

export function Filters() {
  const router = useRouter();
  const sp = useSearchParams();
  const [q, setQ] = useState(sp.get("q") ?? "");

  const push = (next: URLSearchParams) => router.push(`/dashboard/research?${next.toString()}`);

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(sp.toString());
    if (value) next.set(key, value); else next.delete(key);
    push(next);
  };

  const submitSearch = () => {
    const next = new URLSearchParams(sp.toString());
    const term = q.trim();
    if (term) next.set("q", term); else next.delete("q");
    push(next);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <form
        onSubmit={(e) => { e.preventDefault(); submitSearch(); }}
        className="relative min-w-[16rem] flex-1"
      >
        <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by party, case number, or judge…" className="input pl-9" aria-label="Search judgments" />
      </form>
      <select value={sp.get("court") ?? ""} onChange={(e) => setParam("court", e.target.value)} className="input max-w-[16rem]" aria-label="Court">
        <option value="">All courts</option>
        {COURTS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
      </select>
      <select value={sp.get("year") ?? ""} onChange={(e) => setParam("year", e.target.value)} className="input max-w-[9rem]" aria-label="Year">
        <option value="">All years</option>
        {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
      </select>
      <button type="button" onClick={submitSearch} className="btn btn-primary">Search</button>
    </div>
  );
}
