"use client";

// WO-331 EXACT-FIDELITY RECONCILE · Rebuilt to reproduce the reference's command row node-for-node
// (design-mockups/iteration3/console/cases.tsx): search · List/Agenda · Court · Open/Disposed ·
// Filters (badge) · Refresh all cases — one row, nothing else. The WO-147 toolbar's richer surface
// (sort menu, save-view button + tab strip, active-filter chip row, advocate/act/judge/statuses
// multi-selects) doesn't have a slot in the reference and is intentionally NOT reproduced inline —
// see the file-level trade-off note below. Sorting still works via the table's own column headers
// (cases-table.tsx SortHeader), which is how the reference sorts too (it has no sort control here).
//
// Real functionality that had no 1:1 reference slot:
//  · Saved views (name/save/delete) — the reference's Filters-drawer header has an (inert, in the
//    mockup) Bookmark icon with no obvious other purpose; wired here to reveal the real saved-views
//    panel, so the capability keeps a real, deliberate home instead of being deleted outright.
//  · Advocate / Act / Judge / raw-status multi-selects, the sort dropdown, and the top saved-view
//    pill strip — genuinely dropped from this surface (no reference slot to place them honestly
//    without adding UI the reference doesn't have). Existing saved views that reference them still
//    filter correctly (cases-query.ts is unchanged) — only the editing UI for those specific facets
//    is gone. Flagged in the PR description for founder review, not silently reintroduced.
import { useEffect, useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/icons";
import { Combobox } from "@/components/combobox";
import { useCasesNav, type SavedView } from "./cases-nav";
import { saveView, deleteView } from "./view-actions";
import { Segmented } from "./segmented";
import { AddCaseButton } from "./add-case-modal";
import type { TierCounts } from "./cases-query";

type Props = {
  courts: string[];
  caseTypes: string[];
  stages: string[];
  tierCounts: TierCounts;
  views: SavedView[];
  autoCnr?: string;
  autoOpen?: boolean;
};

export function CasesToolbar(props: Props) {
  const { tierCounts, views, autoCnr, autoOpen } = props;
  const t = useTranslations("cases.toolbar");
  const tc = useTranslations("cases.console");
  const tt = useTranslations("cases.tierTabs");
  const tvw = useTranslations("cases.view");
  const tviews = useTranslations("cases.views");
  const { sp, setParam, view, setView } = useCasesNav();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [refreshOpen, setRefreshOpen] = useState(false);

  const qParam = sp.get("q") ?? "";
  const [q, setQ] = useState(qParam);
  useEffect(() => setQ(qParam), [qParam]);

  // The reference's "/" jump-to-search shortcut. Skips when focus is already inside an
  // input/textarea/select so it never steals a "/" a user is typing elsewhere.
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tgt = e.target as HTMLElement | null;
      if (e.key !== "/" || (tgt && /input|textarea|select/i.test(tgt.tagName))) return;
      e.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const tier = sp.get("tier") ?? "";
  // The reference's status segment has only Open/Disposed (no "All") and starts on Open —
  // matched here: an absent `status` param reads (and displays) as "open", never "all".
  const status = sp.get("status") || "open";

  const tierOpts = [
    { value: "", label: tt("all"), count: tierCounts.all },
    { value: "HC", label: tt("shortHC"), count: tierCounts.HC },
    { value: "DISTRICT", label: tt("shortDISTRICT"), count: tierCounts.DISTRICT },
    ...(tierCounts.TRIBUNAL > 0 ? [{ value: "TRIBUNAL", label: tt("TRIBUNAL"), count: tierCounts.TRIBUNAL }] : []),
    ...(tierCounts.SC > 0 ? [{ value: "SC", label: tt("SC"), count: tierCounts.SC }] : []),
  ];
  const statusOpts = [
    { value: "open", label: tviews("open") },
    { value: "disposed", label: tviews("disposed") },
  ];

  const PANEL_FACETS = ["court", "case_type", "stage", "next"] as const;
  const panelCount = PANEL_FACETS.reduce((n, k) => n + (sp.get(k) ? 1 : 0), 0);

  return (
    <section aria-label={t("toolbarAria")} className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {/* Search — the one full-text control; submits/updates the ?q param. */}
        <form
          onSubmit={(e) => { e.preventDefault(); setParam("q", q.trim()); }}
          className="relative min-w-[220px] flex-1"
        >
          <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ec-ink-3" />
          <input
            ref={searchRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onBlur={() => { if ((sp.get("q") ?? "") !== q.trim()) setParam("q", q.trim()); }}
            placeholder={tc("searchPlaceholder")}
            aria-label={tc("searchAria")}
            className="input pl-9 pr-9"
            type="search"
          />
          <span
            aria-hidden="true"
            className="num pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rounded border border-ec-hair px-1.5 text-[10px] text-ec-ink-3"
          >
            /
          </span>
        </form>

        <Segmented
          label={tvw("aria")}
          value={view}
          options={[{ value: "list", label: tvw("list") }, { value: "agenda", label: tvw("agenda") }]}
          onChange={(v) => setView(v as "list" | "agenda")}
        />
        <Segmented label={tt("label")} value={tier} options={tierOpts} onChange={(v) => setParam("tier", v)} />
        <Segmented label={tc("status")} value={status} options={statusOpts} onChange={(v) => setParam("status", v === "open" ? "" : v)} />

        <button
          type="button"
          onClick={() => setFiltersOpen(true)}
          className="ec-btn ec-btn-ghost px-3 py-2 text-xs"
        >
          <Icon name="sliders" className="h-3.5 w-3.5" /> {t("filters")}
          {panelCount > 0 && (
            <span className="num ml-0.5 grid h-4 min-w-[16px] place-items-center rounded-full bg-ec-honey px-1 text-[0.6rem] font-bold text-ec-on-honey">
              {panelCount}
            </span>
          )}
        </button>

        {/* WO-331 · the reference's "Refresh all cases" control, rendered exactly as it shows it
            (a normal, clickable button — no disabled/"Soon" treatment grafted on). The ACTION stays
            deferred: clicking opens an honest info modal instead of a fake confirm-and-succeed flow,
            since a synchronous fan-out over every matter is exactly what WO-309 ruled out on measured
            WAF evidence (BP-66). */}
        <button
          type="button"
          onClick={() => setRefreshOpen(true)}
          className="flex items-center gap-1.5 rounded-ec-s border border-ec-hair bg-ec-card px-3 py-1.5 text-[13px] text-ec-ink-2 transition-colors hover:border-ec-bronze hover:text-ec-bronze"
        >
          <Icon name="refresh" className="h-3.5 w-3.5" /> {t("refreshAll")}
        </button>

        {/* Primary action — no reference slot (cases.tsx's own "+ New case" lives in its app-shell's
            global top bar, outside this component); kept here as the only real entry point we have. */}
        <AddCaseButton autoCnr={autoCnr} autoOpen={autoOpen} courts={props.courts} />
      </div>

      {filtersOpen && <FiltersSheet {...props} onClose={() => setFiltersOpen(false)} />}
      {refreshOpen && <RefreshAllModal onClose={() => setRefreshOpen(false)} />}
    </section>
  );
}

// ── "Refresh all cases" — honest info modal (WO-309 gate; see the toolbar button above). WO-346:
// footer matched to the reference's Cancel + primary-CTA layout (cases.tsx's own refresh-all
// modal) — the primary stays real-honest (disabled + tooltip), since a synchronous fan-out over
// every matter is exactly what WO-309 ruled out on measured WAF evidence (BP-66), not something
// this modal can fake as a working button.
function RefreshAllModal({ onClose }: { onClose: () => void }) {
  const t = useTranslations("cases.toolbar");
  const tc = useTranslations("common");
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-6" role="dialog" aria-modal="true" aria-labelledby="refresh-all-title">
      <div className="absolute inset-0 bg-ec-ink/40" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-ec-l border border-ec-line-strong bg-ec-card shadow-ec-2">
        <div className="flex items-start justify-between border-b border-ec-hair px-5 py-4">
          <h2 id="refresh-all-title" className="font-display text-lg font-medium text-ec-ink">{t("refreshModalTitle")}</h2>
          <button type="button" onClick={onClose} aria-label={t("refreshModalClose")} className="shrink-0 rounded p-1 text-ec-muted-ink transition-colors hover:bg-ec-paper-3 hover:text-ec-ink">
            <Icon name="close" className="h-4 w-4" />
          </button>
        </div>
        <p className="px-5 py-5 text-[13.5px] leading-relaxed text-ec-ink-2">{t("refreshModalBody")}</p>
        <div className="flex gap-2 border-t border-ec-hair px-5 py-4">
          <button type="button" onClick={onClose} className="ec-btn ec-btn-ghost">{tc("actions.cancel")}</button>
          <button
            type="button"
            disabled
            title={t("refreshAllTitle")}
            aria-disabled="true"
            className="ec-btn ec-btn-ink flex-1 opacity-40"
          >
            {t("refreshModalPrimary")}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── the Filters sheet (right drawer) ────────────────────────────────────────────────────────────
// Reference: 4 single-value fields (Court / Case type / Stage / Next hearing) + a Bookmark trigger
// in the header. Single-select — not the old MultiSelect — to match; the backend still accepts
// repeated params, so nothing about the query contract changes, only how many values the UI sets
// at once. A native dropdown would violate the no-raw-select-for-a-long-list rule for court/case
// type, so this uses the shared searchable Combobox instead (the reference's own plain dropdown is
// translated, not copied verbatim — see ui-frontend.md).
function FiltersSheet({
  courts, caseTypes, stages, views, onClose,
}: Props & { onClose: () => void }) {
  const t = useTranslations("cases.toolbar");
  const tc = useTranslations("cases.console");
  const { sp, setParam, clearPanel } = useCasesNav();
  const [savedViewsOpen, setSavedViewsOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [onClose]);

  const single = (key: string, label: string, placeholder: string, options: string[]) => (
    <div>
      <p className="ec-label mb-1.5">{label}</p>
      <Combobox
        label={label}
        placeholder={placeholder}
        options={options.map((v) => ({ value: v, label: v }))}
        value={sp.get(key) || null}
        onChange={(v) => setParam(key, v ?? "")}
      />
    </div>
  );

  return (
    <div className="fixed inset-0 z-ec-drawer" role="dialog" aria-modal="true" aria-label={t("sheetTitle")}>
      <div className="absolute inset-0 bg-ec-ink/40" onClick={onClose} />
      {/* WO-401 A5: shadow-ec-2 (a subtle dropdown shadow) read as flat against a full-height
          drawer — shadow-ec-3 (the deep-modal shadow, WO-400) gives it real elevation. */}
      <div className="absolute inset-y-0 right-0 flex w-full max-w-[380px] flex-col border-l border-ec-hair bg-ec-paper shadow-ec-3">
        <div className="flex items-start justify-between border-b border-ec-hair px-5 py-4">
          <div className="flex items-center gap-2">
            <h2 className="font-display text-lg font-medium text-ec-ink">{t("sheetTitle")}</h2>
            <button
              type="button"
              onClick={() => setSavedViewsOpen((v) => !v)}
              aria-pressed={savedViewsOpen}
              aria-label={savedViewsOpen ? t("savedViewsClose") : t("savedViews")}
              title={savedViewsOpen ? t("savedViewsClose") : t("savedViews")}
              className={savedViewsOpen ? "text-ec-bronze-deep" : "text-ec-muted-ink hover:text-ec-bronze"}
            >
              <Icon name="bookmark" className="h-[15px] w-[15px]" />
            </button>
          </div>
          <button type="button" onClick={onClose} aria-label={t("done")} className="flex h-8 w-8 items-center justify-center rounded-ec-s text-ec-ink-3 transition hover:bg-ec-paper-3 hover:text-ec-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ec-indigo">
            <Icon name="close" className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {savedViewsOpen && <SavedViewsPanel views={views} />}
          {single("court", tc("court"), tc("allCourts"), courts)}
          {single("case_type", tc("caseType"), tc("allTypes"), caseTypes)}
          {single("stage", tc("stage"), tc("allStages"), stages)}
          <div>
            <p className="ec-label mb-1.5">{tc("nextHearing")}</p>
            <Combobox
              label={tc("nextHearing")}
              placeholder={tc("anyHearing")}
              options={[
                { value: "overdue", label: tc("overdue") },
                { value: "7d", label: tc("next7") },
                { value: "30d", label: tc("next30") },
                { value: "none", label: tc("noHearing") },
              ]}
              value={sp.get("next") ?? null}
              onChange={(v) => setParam("next", v ?? "")}
            />
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-ec-hair px-5 py-3">
          <button type="button" onClick={clearPanel} className="text-xs font-medium text-ec-ink-3 hover:text-ec-ink">{t("clearAll")}</button>
          <button type="button" onClick={onClose} className="ec-btn ec-btn-ink px-4 py-1.5 text-xs">{t("done")}</button>
        </div>
      </div>
    </div>
  );
}

// ── saved views — real functionality tucked behind the drawer's Bookmark trigger (see the
// file-level note above for why it lives here rather than the reference's top-of-page tab strip).
function SavedViewsPanel({ views }: { views: SavedView[] }) {
  const tv = useTranslations("cases.views");
  const t = useTranslations("cases.toolbar");
  const tc = useTranslations("cases.console");
  const { sp, clearAll, applyQuery } = useCasesNav();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const VIEW_KEYS = ["q", "court", "case_type", "stage", "status", "next"] as const;
  const currentQuery = () => {
    const out: Record<string, string | string[]> = {};
    for (const k of VIEW_KEYS) {
      const v = sp.get(k);
      if (v) out[k] = v;
    }
    return out;
  };
  const onSave = () => startTransition(async () => {
    const res = await saveView(name, currentQuery());
    setMsg(res.message);
    if (res.ok) { setName(""); setEditing(false); }
  });

  const same = (a: string[], b: string[]) => a.length === b.length && [...a].sort().join(" ") === [...b].sort().join(" ");
  const isActive = (v: SavedView) => VIEW_KEYS.every((k) => {
    const saved = v.query[k];
    const arr = saved == null ? [] : Array.isArray(saved) ? saved : [saved];
    return same(arr, sp.getAll(k));
  });
  const anyFilter = VIEW_KEYS.some((k) => sp.getAll(k).length > 0);

  return (
    <div className="space-y-2 rounded-ec-s border border-ec-hair bg-ec-paper-3 p-3">
      <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label={tv("aria")}>
        <button type="button" role="tab" aria-selected={!anyFilter} onClick={clearAll} className={`rounded-full px-2.5 py-1 text-[0.7rem] font-medium transition ${!anyFilter ? "bg-ec-ink text-ec-paper" : "text-ec-ink-2 hover:bg-ec-bronze-tint"}`}>
          {tv("all")}
        </button>
        {views.map((v) => (
          <span key={v.id} className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[0.7rem] font-medium transition ${isActive(v) ? "bg-ec-ink text-ec-paper" : "text-ec-ink-2 hover:bg-ec-bronze-tint"}`}>
            <button type="button" role="tab" aria-selected={isActive(v)} onClick={() => applyQuery(v.query)}>{v.name}</button>
            <button
              type="button"
              aria-label={tv("deleteView", { name: v.name })}
              onClick={() => { if (window.confirm(tv("deleteConfirm", { name: v.name }))) startTransition(async () => { await deleteView(v.id); }); }}
              disabled={pending}
              className={isActive(v) ? "text-ec-paper/70 hover:text-ec-paper" : "text-ec-ink-3 hover:text-ec-danger"}
            >
              <Icon name="close" className="h-2.5 w-2.5" />
            </button>
          </span>
        ))}
      </div>
      {editing ? (
        <span className="flex items-center gap-1.5">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={tc("viewName")} aria-label={tc("viewName")} autoFocus className="input max-w-[9rem] py-1.5 text-xs" />
          <button type="button" onClick={onSave} disabled={pending || !name.trim()} className="ec-btn ec-btn-ink px-2.5 py-1.5 text-xs">{tc("save")}</button>
          <button type="button" onClick={() => { setEditing(false); setMsg(null); }} className="ec-btn ec-btn-ghost px-2 py-1.5 text-xs">{tc("cancel")}</button>
        </span>
      ) : (
        <button type="button" onClick={() => { setEditing(true); setMsg(null); }} className="inline-flex items-center gap-1.5 text-xs font-medium text-ec-ink-2 hover:text-ec-bronze-deep">
          <Icon name="plus" className="h-3.5 w-3.5" /> {t("saveView")}
        </button>
      )}
      {msg && <span className="block text-xs text-ec-ink-3">{msg}</span>}
    </div>
  );
}
