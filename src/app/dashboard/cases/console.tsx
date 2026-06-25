"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { Icon } from "@/components/icons";
import { saveView, deleteView } from "./view-actions";

// Query keys the console owns. Used to (re)build the URL and to snapshot a saved view.
const KEYS = ["q", "court", "case_type", "stage", "status", "next", "sort"] as const;

export type SavedView = { id: string; name: string; query: Record<string, string> };

export function Console({
  courts,
  caseTypes,
  stages,
  views,
}: {
  courts: string[];
  caseTypes: string[];
  stages: string[];
  views: SavedView[];
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const [q, setQ] = useState(sp.get("q") ?? "");
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const push = (next: URLSearchParams) => router.push(next.toString() ? `/dashboard/cases?${next.toString()}` : "/dashboard/cases");

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(sp.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    push(next);
  };

  const applyView = (query: Record<string, string>) => {
    const next = new URLSearchParams();
    for (const k of KEYS) if (query[k]) next.set(k, query[k]);
    setQ(query.q ?? "");
    push(next);
  };

  const currentQuery = () => {
    const out: Record<string, string> = {};
    for (const k of KEYS) {
      const v = k === "q" ? q.trim() : sp.get(k);
      if (v) out[k] = v;
    }
    return out;
  };

  const onSave = () =>
    startTransition(async () => {
      const res = await saveView(name, currentQuery());
      setMsg(res.message);
      if (res.ok) {
        setName("");
        setSaving(false);
      }
    });

  const onDelete = (id: string) =>
    startTransition(async () => {
      const res = await deleteView(id);
      if (!res.ok) setMsg(res.message);
    });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setParam("q", q.trim());
          }}
          className="relative min-w-[14rem] flex-1"
        >
          <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search cases — title, CNR, court, parties…"
            className="input pl-9"
            aria-label="Search cases"
          />
        </form>

        <select value={sp.get("court") ?? ""} onChange={(e) => setParam("court", e.target.value)} className="input max-w-[12rem]" aria-label="Court">
          <option value="">All courts</option>
          {courts.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>

        <select value={sp.get("case_type") ?? ""} onChange={(e) => setParam("case_type", e.target.value)} className="input max-w-[11rem]" aria-label="Case type">
          <option value="">All types</option>
          {caseTypes.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>

        <select value={sp.get("stage") ?? ""} onChange={(e) => setParam("stage", e.target.value)} className="input max-w-[11rem]" aria-label="Stage">
          <option value="">All stages</option>
          {stages.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>

        <select value={sp.get("status") ?? ""} onChange={(e) => setParam("status", e.target.value)} className="input max-w-[10rem]" aria-label="Status">
          <option value="">All statuses</option>
          <option value="open">Open</option>
          <option value="disposed">Disposed</option>
        </select>

        <select value={sp.get("next") ?? ""} onChange={(e) => setParam("next", e.target.value)} className="input max-w-[11rem]" aria-label="Next hearing">
          <option value="">Any hearing</option>
          <option value="overdue">Overdue</option>
          <option value="7d">Next 7 days</option>
          <option value="30d">Next 30 days</option>
          <option value="none">No hearing set</option>
        </select>

        <select value={sp.get("sort") ?? ""} onChange={(e) => setParam("sort", e.target.value)} className="input max-w-[12rem]" aria-label="Sort">
          <option value="">Next hearing ↑</option>
          <option value="created_at">Recently added</option>
          <option value="title">Title A–Z</option>
        </select>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {views.map((v) => (
          <span key={v.id} className="badge bg-paper text-ink-muted border border-line">
            <button type="button" onClick={() => applyView(v.query)} className="hover:text-brand-700">
              {v.name}
            </button>
            <button
              type="button"
              onClick={() => onDelete(v.id)}
              disabled={pending}
              aria-label={`Delete view ${v.name}`}
              className="text-ink-faint hover:text-red-600"
            >
              ×
            </button>
          </span>
        ))}

        {saving ? (
          <span className="flex items-center gap-1.5">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="View name"
              className="input max-w-[10rem] py-1.5 text-xs"
              aria-label="View name"
              autoFocus
            />
            <button type="button" onClick={onSave} disabled={pending} className="btn-primary px-3 py-1.5 text-xs">
              <Icon name="check" className="h-3.5 w-3.5" /> Save
            </button>
            <button type="button" onClick={() => { setSaving(false); setMsg(null); }} className="btn-ghost px-2 py-1.5 text-xs">
              Cancel
            </button>
          </span>
        ) : (
          <button type="button" onClick={() => { setSaving(true); setMsg(null); }} className="btn-ghost px-3 py-1.5 text-xs">
            <Icon name="plus" className="h-3.5 w-3.5" /> Save this view
          </button>
        )}

        {msg && <span className="text-xs text-ink-faint">{msg}</span>}
      </div>
    </div>
  );
}
