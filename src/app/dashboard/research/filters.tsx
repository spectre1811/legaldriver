"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Icon } from "@/components/icons";

type Opt = { value: string; label: string };

export function Filters({ courts, years, disposals }: { courts: Opt[]; years: Opt[]; disposals: Opt[] }) {
  const router = useRouter();
  const sp = useSearchParams();
  const [q, setQ] = useState(sp.get("q") ?? "");

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(sp.toString());
    if (value) next.set(key, value); else next.delete(key);
    router.push(`/dashboard/research?${next.toString()}`);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <form
        onSubmit={(e) => { e.preventDefault(); setParam("q", q.trim()); }}
        className="relative min-w-[16rem] flex-1"
      >
        <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by party, case number, or judge…" className="input pl-9" aria-label="Search judgments" />
      </form>
      <select value={sp.get("court") ?? ""} onChange={(e) => setParam("court", e.target.value)} className="input max-w-[16rem]" aria-label="Court">
        <option value="">All courts</option>
        {courts.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
      </select>
      <select value={sp.get("year") ?? ""} onChange={(e) => setParam("year", e.target.value)} className="input max-w-[9rem]" aria-label="Year">
        <option value="">All years</option>
        {years.map((y) => <option key={y.value} value={y.value}>{y.label}</option>)}
      </select>
      <select value={sp.get("disposal") ?? ""} onChange={(e) => setParam("disposal", e.target.value)} className="input max-w-[14rem]" aria-label="Disposal">
        <option value="">All dispositions</option>
        {disposals.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
      </select>
      <select value={sp.get("sort") ?? ""} onChange={(e) => setParam("sort", e.target.value)} className="input max-w-[12rem]" aria-label="Sort">
        <option value="">Most recent decision</option>
        <option value="year">Most recent year</option>
      </select>
    </div>
  );
}
