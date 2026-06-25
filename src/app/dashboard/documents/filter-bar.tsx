"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Icon } from "@/components/icons";

export function FilterBar({ types }: { types: string[] }) {
  const router = useRouter();
  const sp = useSearchParams();
  const [q, setQ] = useState(sp.get("q") ?? "");

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(sp.toString());
    if (value) next.set(key, value); else next.delete(key);
    router.push(`/dashboard/documents?${next.toString()}`);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <form
        onSubmit={(e) => { e.preventDefault(); setParam("q", q.trim()); }}
        className="relative min-w-[14rem] flex-1"
      >
        <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search documents (filename + contents)…" className="input pl-9" aria-label="Search documents" />
      </form>
      <select value={sp.get("source") ?? ""} onChange={(e) => setParam("source", e.target.value)} className="input max-w-[10rem]" aria-label="Source">
        <option value="">All sources</option>
        <option value="gmail">Gmail</option>
        <option value="upload">Upload</option>
        <option value="court_order">Court order</option>
      </select>
      <select value={sp.get("type") ?? ""} onChange={(e) => setParam("type", e.target.value)} className="input max-w-[11rem]" aria-label="Type">
        <option value="">All types</option>
        {types.map((t) => <option key={t} value={t}>{t}</option>)}
      </select>
      <select value={sp.get("filed") ?? ""} onChange={(e) => setParam("filed", e.target.value)} className="input max-w-[9rem]" aria-label="Filed">
        <option value="">All</option>
        <option value="filed">Filed</option>
        <option value="unfiled">Unfiled</option>
      </select>
    </div>
  );
}
