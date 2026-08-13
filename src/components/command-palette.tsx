"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Icon, type IconName } from "@/components/icons";
import { NAV_TARGETS } from "@/app/dashboard/nav";

interface Item { kind: "action" | "nav" | "result"; type: string; label: string; sub: string; href: string; icon?: IconName }

// Quick create/do actions — deep-link to where the action begins.
const QUICK: { key: string; href: string; icon: IconName; keywords: string }[] = [
  { key: "addCase", href: "/dashboard/search/directory", icon: "plus", keywords: "add case cnr track new matter lookup" },
  // WO-206: newNotice removed — the notices module is disabled (see nav.tsx DISABLED_MODULES).
  // WO-376 B6: "draft" (Draft a document) removed — founder quick-wins cleanup.
  { key: "upload", href: "/dashboard/documents", icon: "upload", keywords: "upload document file attach" },
  { key: "addAdvocate", href: "/dashboard/settings", icon: "clients", keywords: "advocate bar add settings profile" },
];

// Global ⌘K / Ctrl-K palette: run-actions (quick actions + jump-to-section) AND entity
// search across cases, clients, documents, invoices, notices. Rendered once in the layout.
export function CommandPalette({ compact = false }: { compact?: boolean } = {}) {
  const t = useTranslations("shell");
  const tn = useTranslations("nav");
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Item[]>([]);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  // All local commands (actions + jump-to), memoised on the translators.
  const commands: Item[] = useMemo(() => {
    const actions: Item[] = QUICK.map((a) => ({
      kind: "action", type: t("commandPalette.actionType"),
      label: t(`commandPalette.action.${a.key}`), sub: `${a.keywords}`, href: a.href, icon: a.icon,
    }));
    const nav: Item[] = NAV_TARGETS.map((n) => ({
      kind: "nav", type: t("commandPalette.goType"),
      label: tn(`item.${n.label}`), sub: n.label, href: n.href, icon: n.icon,
    }));
    return [...actions, ...nav];
  }, [t, tn]);

  // Filter commands by the query; empty query shows the quick actions as defaults.
  const filteredCmds = useMemo(() => {
    const ql = q.trim().toLowerCase();
    if (!ql) return commands.filter((c) => c.kind === "action");
    return commands.filter((c) => c.label.toLowerCase().includes(ql) || c.sub.toLowerCase().includes(ql));
  }, [q, commands]);

  const items: Item[] = useMemo(() => [...filteredCmds, ...hits], [filteredCmds, hits]);

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
  useEffect(() => { setActive(0); }, [q]);

  // Debounced entity search (needs ≥2 chars; commands cover shorter queries).
  useEffect(() => {
    if (q.trim().length < 2) { setHits([]); return; }
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
        const d = await r.json();
        setHits((d.results ?? []).map((h: { type: string; label: string; sub: string; href: string }) => ({ kind: "result", ...h })));
      } catch { setHits([]); }
      finally { setLoading(false); }
    }, 180);
    return () => clearTimeout(timer);
  }, [q]);

  const go = useCallback((h: Item) => { setOpen(false); router.push(h.href); }, [router]);

  if (!open) return <CommandTrigger onClick={() => setOpen(true)} compact={compact} />;

  const cmdCount = filteredCmds.length;
  const heading = (key: string, label: string) => (
    <p key={key} className="px-4 pb-1 pt-2 text-[0.65rem] font-medium uppercase tracking-wide text-ec-muted-ink">{label}</p>
  );
  const row = (it: Item, i: number) => (
    <button
      key={it.href + i} onClick={() => go(it)} onMouseEnter={() => setActive(i)}
      className={`flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm ${i === active ? "bg-ec-bronze-tint" : ""}`}
    >
      {it.icon ? <Icon name={it.icon} className="h-4 w-4 shrink-0 text-ec-muted-ink" /> : <span className="w-4 shrink-0" />}
      <span className="min-w-0 flex-1 truncate font-medium text-ec-ink">{it.label}</span>
      {/* On entity results the sub is the identifier (CNR / ₹amount) — show it in mono. On commands
          the sub is filter keywords, so it stays hidden. */}
      {it.kind === "result" && it.sub && <span className="shrink-0 truncate font-mono text-[0.7rem] text-ec-muted-ink">{it.sub}</span>}
      <span className="shrink-0 text-[0.7rem] text-ec-muted-ink">{it.type}</span>
    </button>
  );

  return (
    <>
      <CommandTrigger onClick={() => setOpen(true)} compact={compact} />
      {/* WO-413 · ⌘K reskin — migrated off the legacy surface/line/ink-faint tokens to the ec-*
          system (bg-ec-card matches surface's exact value — --card aliases --paper-2, same as the
          legacy `surface` token — border-ec-hair/z-ec-modal/bg-ec-ink-40 match every other overlay
          in the app, e.g. components/ui/dialog.tsx). */}
      <div className="fixed inset-0 z-ec-modal flex items-start justify-center bg-ec-ink/40 px-4 pt-[12vh] backdrop-blur-sm" onClick={() => setOpen(false)}>
        <div className="w-full max-w-xl overflow-hidden rounded-ec-l border border-ec-hair bg-ec-card shadow-ec-2" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center gap-2 border-b border-ec-hair px-4">
            <Icon name="search" className="h-4 w-4 text-ec-muted-ink" />
            <input
              ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, items.length - 1)); }
                if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
                if (e.key === "Enter" && items[active]) go(items[active]);
              }}
              placeholder={t("commandPalette.placeholder")}
              className="flex-1 bg-transparent py-3.5 text-sm outline-none placeholder:text-ec-muted-ink"
            />
            <kbd className="rounded border border-ec-hair px-1.5 py-0.5 text-[0.65rem] text-ec-muted-ink">esc</kbd>
          </div>
          <div className="max-h-[52vh] overflow-y-auto py-1">
            {items.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-ec-muted-ink">
                {loading ? t("commandPalette.searching") : t("commandPalette.noMatches")}
              </p>
            ) : (
              <>
                {cmdCount > 0 && heading("cmds", q.trim() ? t("commandPalette.commandsHeading") : t("commandPalette.quickHeading"))}
                {filteredCmds.map((it, i) => row(it, i))}
                {hits.length > 0 && heading("results", t("commandPalette.resultsHeading"))}
                {hits.map((it, j) => row(it, cmdCount + j))}
                {loading && hits.length === 0 && q.trim().length >= 2 && (
                  <p className="px-4 py-3 text-center text-xs text-ec-muted-ink">{t("commandPalette.searching")}</p>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function CommandTrigger({ onClick, compact = false }: { onClick: () => void; compact?: boolean }) {
  const t = useTranslations("shell");
  // Compact = top-bar shell. WO-345: label+kbd visible from md: — the compact trigger only
  // ever renders inside the top bar (itself `hidden md:flex`), so "no hidden lg: gate" IS
  // "visible from md". Default (below) = sidebar full-width.
  if (compact) {
    return (
      <button
        onClick={onClick}
        aria-label={t("commandPalette.trigger")}
        className="flex h-9 items-center gap-2 rounded-ec-s border border-ec-hair bg-ec-paper px-2.5 text-sm text-ec-ink-3 transition hover:border-ec-hair-strong hover:text-ec-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ec-honey"
      >
        <Icon name="search" className="h-4 w-4" />
        <span className="text-left">{t("commandPalette.trigger")}</span>
        <kbd className="ml-1 rounded border border-ec-hair px-1.5 py-0.5 text-[0.65rem]">⌘K</kbd>
      </button>
    );
  }
  return (
    <button onClick={onClick} className="mb-3 flex w-full items-center gap-2 rounded-xl border border-ec-hair bg-ec-paper px-3 py-2 text-sm text-ec-muted-ink transition hover:border-ec-hair-strong hover:text-ec-ink">
      <Icon name="search" className="h-4 w-4" />
      <span className="flex-1 text-left">{t("commandPalette.trigger")}</span>
      <kbd className="rounded border border-ec-hair px-1.5 py-0.5 text-[0.65rem]">⌘K</kbd>
    </button>
  );
}
