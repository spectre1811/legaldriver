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
  { key: "newNotice", href: "/dashboard/notices", icon: "notices", keywords: "notice legal escalation" },
  { key: "draft", href: "/dashboard/assistant/draft", icon: "edit", keywords: "draft document reply generate write" },
  { key: "upload", href: "/dashboard/documents", icon: "upload", keywords: "upload document file attach" },
  { key: "addAdvocate", href: "/dashboard/settings", icon: "clients", keywords: "advocate bar add settings profile" },
];

// Global ⌘K / Ctrl-K palette: run-actions (quick actions + jump-to-section) AND entity
// search across cases, clients, documents, invoices, notices. Rendered once in the layout.
export function CommandPalette() {
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

  if (!open) return <CommandTrigger onClick={() => setOpen(true)} />;

  const cmdCount = filteredCmds.length;
  const heading = (key: string, label: string) => (
    <p key={key} className="px-4 pb-1 pt-2 text-[0.65rem] font-medium uppercase tracking-wide text-ink-faint">{label}</p>
  );
  const row = (it: Item, i: number) => (
    <button
      key={it.href + i} onClick={() => go(it)} onMouseEnter={() => setActive(i)}
      className={`flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm ${i === active ? "bg-brand-50" : ""}`}
    >
      {it.icon ? <Icon name={it.icon} className="h-4 w-4 shrink-0 text-ink-faint" /> : <span className="w-4 shrink-0" />}
      <span className="min-w-0 flex-1 truncate font-medium text-ink">{it.label}</span>
      {/* On entity results the sub is the identifier (CNR / ₹amount) — show it in mono. On commands
          the sub is filter keywords, so it stays hidden. */}
      {it.kind === "result" && it.sub && <span className="shrink-0 truncate font-mono text-[0.7rem] text-ink-faint">{it.sub}</span>}
      <span className="shrink-0 text-[0.7rem] text-ink-faint">{it.type}</span>
    </button>
  );

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
                if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, items.length - 1)); }
                if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
                if (e.key === "Enter" && items[active]) go(items[active]);
              }}
              placeholder={t("commandPalette.placeholder")}
              className="flex-1 bg-transparent py-3.5 text-sm outline-none placeholder:text-ink-faint"
            />
            <kbd className="rounded border border-line px-1.5 py-0.5 text-[0.65rem] text-ink-faint">esc</kbd>
          </div>
          <div className="max-h-[52vh] overflow-y-auto py-1">
            {items.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-ink-faint">
                {loading ? t("commandPalette.searching") : t("commandPalette.noMatches")}
              </p>
            ) : (
              <>
                {cmdCount > 0 && heading("cmds", q.trim() ? t("commandPalette.commandsHeading") : t("commandPalette.quickHeading"))}
                {filteredCmds.map((it, i) => row(it, i))}
                {hits.length > 0 && heading("results", t("commandPalette.resultsHeading"))}
                {hits.map((it, j) => row(it, cmdCount + j))}
                {loading && hits.length === 0 && q.trim().length >= 2 && (
                  <p className="px-4 py-3 text-center text-xs text-ink-faint">{t("commandPalette.searching")}</p>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function CommandTrigger({ onClick }: { onClick: () => void }) {
  const t = useTranslations("shell");
  return (
    <button onClick={onClick} className="mb-3 flex w-full items-center gap-2 rounded-xl border border-line bg-paper px-3 py-2 text-sm text-ink-faint transition hover:border-brand-300 hover:text-ink">
      <Icon name="search" className="h-4 w-4" />
      <span className="flex-1 text-left">{t("commandPalette.trigger")}</span>
      <kbd className="rounded border border-line px-1.5 py-0.5 text-[0.65rem]">⌘K</kbd>
    </button>
  );
}
