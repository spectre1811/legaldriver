"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";

interface Hit { type: string; label: string; sub: string; href: string }

// Global ⌘K / Ctrl-K search across cases, clients, documents, invoices, notices.
// Rendered once in the dashboard layout; a visible trigger sits in the sidebar.
export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  // Open on ⌘K / Ctrl-K (and "/" when not typing); close on Esc.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !/input|textarea|select/i.test((e.target as HTMLElement)?.tagName ?? ""))) {
        e.preventDefault(); setOpen((v) => !v);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 20); else { setQ(""); setHits([]); setActive(0); } }, [open]);

  // Debounced search.
  useEffect(() => {
    if (q.trim().length < 2) { setHits([]); return; }
    const t = setTimeout(async () => {
      setLoading(true);
      try { const r = await fetch(`/api/search?q=${encodeURIComponent(q)}`); const d = await r.json(); setHits(d.results ?? []); setActive(0); }
      catch { setHits([]); }
      finally { setLoading(false); }
    }, 180);
    return () => clearTimeout(t);
  }, [q]);

  const go = useCallback((h: Hit) => { setOpen(false); router.push(h.href); }, [router]);

  if (!open) return <CommandTrigger onClick={() => setOpen(true)} />;

  return (
    <>
      <CommandTrigger onClick={() => setOpen(true)} />
      <div className="fixed inset-0 z-50 flex items-start justify-center bg-ink/30 px-4 pt-[12vh] backdrop-blur-sm" onClick={() => setOpen(false)}>
        <div className="w-full max-w-xl overflow-hidden rounded-2xl bg-surface shadow-lift" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center gap-2 border-b border-line px-4">
            <Icon name="search" className="h-4 w-4 text-ink-faint" />
            <input
              ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, hits.length - 1)); }
                if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
                if (e.key === "Enter" && hits[active]) go(hits[active]);
              }}
              placeholder="Search cases, clients, documents, invoices, notices…"
              className="flex-1 bg-transparent py-3.5 text-sm outline-none placeholder:text-ink-faint"
            />
            <kbd className="rounded border border-line px-1.5 py-0.5 text-[0.65rem] text-ink-faint">esc</kbd>
          </div>
          <div className="max-h-[52vh] overflow-y-auto py-1">
            {q.trim().length < 2 ? (
              <p className="px-4 py-6 text-center text-sm text-ink-faint">Type to search across your practice.</p>
            ) : loading && !hits.length ? (
              <p className="px-4 py-6 text-center text-sm text-ink-faint">Searching…</p>
            ) : hits.length ? (
              hits.map((h, i) => (
                <button key={h.href + i} onClick={() => go(h)} onMouseEnter={() => setActive(i)}
                  className={`flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm ${i === active ? "bg-brand-50" : ""}`}>
                  <span className="w-20 shrink-0 text-xs text-ink-faint">{h.type}</span>
                  <span className="min-w-0 flex-1 truncate font-medium text-ink">{h.label}</span>
                  {h.sub && <span className="shrink-0 font-mono text-[0.7rem] text-ink-faint">{h.sub}</span>}
                </button>
              ))
            ) : (
              <p className="px-4 py-6 text-center text-sm text-ink-faint">No matches.</p>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function CommandTrigger({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="mb-3 flex w-full items-center gap-2 rounded-xl border border-line bg-paper px-3 py-2 text-sm text-ink-faint transition hover:border-brand-300 hover:text-ink">
      <Icon name="search" className="h-4 w-4" />
      <span className="flex-1 text-left">Search…</span>
      <kbd className="rounded border border-line px-1.5 py-0.5 text-[0.65rem]">⌘K</kbd>
    </button>
  );
}
