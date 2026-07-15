"use client";

// WO-147 W2 · The Cases de-clutter payload. Replaces the old stacked regions (Console 9-facet grid +
// CasesTierTabs + status tabs + count row) with §7's blueprint:
//   one toolbar row (search · court-tier segmented · open/disposed segmented · Filters · sort · save)
//   → saved-view switcher → conditional active-chip row → table.
// Every facet that isn't a dominant axis lives in the right Filters sheet. Nothing navigates the
// page: all state routes through useCasesNav (router.replace soft-nav, URL contract unchanged).
import { useEffect, useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/icons";
import { Combobox, MultiSelect, type ComboOption, RENDER_ALL_MAX } from "@/components/combobox";
import { GROUP_SEP, type FacetGroup } from "./facet-normalize";
import { useCasesNav, PANEL_FACETS, VIEW_KEYS, type SavedView } from "./cases-nav";
import { saveView, deleteView } from "./view-actions";
import { Segmented } from "./segmented";
import { AddCaseButton } from "./add-case-modal";
import type { TierCounts, ViewCounts } from "./cases-query";

type Props = {
  courts: string[];
  caseTypes: string[];
  stages: string[];
  statuses: string[];
  advocateGroups: FacetGroup[];
  actGroups: FacetGroup[];
  judges: string[];
  tierCounts: TierCounts;
  viewCounts: ViewCounts;
  views: SavedView[];
  autoCnr?: string;
};

export function CasesToolbar(props: Props) {
  const { tierCounts, viewCounts, views, autoCnr } = props;
  const t = useTranslations("cases.toolbar");
  const tc = useTranslations("cases.console");
  const tt = useTranslations("cases.tierTabs");
  const tv = useTranslations("cases.views");
  const { sp, setParam } = useCasesNav();
  const [filtersOpen, setFiltersOpen] = useState(false);

  const qParam = sp.get("q") ?? "";
  const [q, setQ] = useState(qParam);
  useEffect(() => setQ(qParam), [qParam]);

  const tier = sp.get("tier") ?? "";
  const status = sp.get("status") ?? "";
  const sort = sp.get("sort") ?? "";

  const tierOpts = [
    { value: "", label: tt("all"), count: tierCounts.all },
    { value: "HC", label: tt("HC"), count: tierCounts.HC },
    { value: "DISTRICT", label: tt("DISTRICT"), count: tierCounts.DISTRICT },
    ...(tierCounts.TRIBUNAL > 0 ? [{ value: "TRIBUNAL", label: tt("TRIBUNAL"), count: tierCounts.TRIBUNAL }] : []),
    ...(tierCounts.SC > 0 ? [{ value: "SC", label: tt("SC"), count: tierCounts.SC }] : []),
  ];
  const statusOpts = [
    { value: "", label: tv("all"), count: viewCounts.all },
    { value: "open", label: tv("open"), count: viewCounts.open },
    { value: "disposed", label: tv("disposed"), count: viewCounts.disposed },
  ];
  const sortOpts = [
    { value: "", label: tc("sortNext") },
    { value: "created_at", label: tc("sortRecent") },
    { value: "title", label: tc("sortTitle") },
  ];

  const panelCount = PANEL_FACETS.reduce((n, k) => n + sp.getAll(k).length, 0);

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
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onBlur={() => { if ((sp.get("q") ?? "") !== q.trim()) setParam("q", q.trim()); }}
            placeholder={tc("searchPlaceholder")}
            aria-label={tc("searchAria")}
            className="input pl-9"
            type="search"
          />
        </form>

        <Segmented label={tt("label")} value={tier} options={tierOpts} onChange={(v) => setParam("tier", v)} />
        <Segmented label={tc("status")} value={status} options={statusOpts} onChange={(v) => setParam("status", v)} />

        <button
          type="button"
          onClick={() => setFiltersOpen(true)}
          className="ec-btn ec-btn-ghost px-3 py-2 text-xs"
        >
          <Icon name="settings" className="h-3.5 w-3.5" /> {t("filters")}
          {panelCount > 0 && (
            <span className="num ml-0.5 grid h-4 min-w-[16px] place-items-center rounded-full bg-ec-honey px-1 text-[0.6rem] font-bold text-ec-on-honey">
              {panelCount}
            </span>
          )}
        </button>

        <SortMenu value={sort} options={sortOpts} label={tc("sort")} onChange={(v) => setParam("sort", v)} />

        <SaveViewButton label={t("saveView")} placeholder={tc("viewName")} save={tc("save")} cancel={tc("cancel")} />

        {/* Primary action — the Add-case card is gone; add-by-CNR lives in this modal now (blueprint §7). */}
        <AddCaseButton autoCnr={autoCnr} />
      </div>

      <ViewSwitcher views={views} allLabel={tv("all")} />
      <ChipRow {...props} />

      {filtersOpen && <FiltersSheet {...props} onClose={() => setFiltersOpen(false)} />}
    </section>
  );
}

// ── sort dropdown ────────────────────────────────────────────────────────────────────────────────
function SortMenu({
  value, options, label, onChange,
}: { value: string; options: { value: string; label: string }[]; label: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("mousedown", onDown); };
  }, [open]);
  const current = options.find((o) => o.value === value) ?? options[0];
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-haspopup="menu" aria-expanded={open} className="ec-btn ec-btn-ghost px-3 py-2 text-xs">
        <Icon name="chevron" className={`h-3.5 w-3.5 transition ${open ? "-rotate-90" : "rotate-90"}`} />
        {label}: {current.label}
      </button>
      {open && (
        <div role="menu" aria-label={label} className="absolute right-0 top-full z-40 mt-1.5 w-52 rounded-ec-m border border-ec-hair bg-ec-paper p-1.5 shadow-ec-2">
          {options.map((o) => (
            <button
              key={o.value || "default"}
              role="menuitemradio"
              aria-checked={o.value === value}
              onClick={() => { onChange(o.value); setOpen(false); }}
              className={`flex w-full items-center justify-between rounded-ec-s px-2.5 py-2 text-left text-sm transition hover:bg-ec-paper-3 ${o.value === value ? "text-ec-ink" : "text-ec-ink-2"}`}
            >
              {o.label}
              {o.value === value && <Icon name="check" className="h-3.5 w-3.5 text-ec-bronze-deep" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── save current query as a named view ───────────────────────────────────────────────────────────
function SaveViewButton({ label, placeholder, save, cancel }: { label: string; placeholder: string; save: string; cancel: string }) {
  const { sp } = useCasesNav();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const currentQuery = () => {
    const out: Record<string, string | string[]> = {};
    for (const k of VIEW_KEYS) {
      const vs = sp.getAll(k);
      if (vs.length) out[k] = vs.length === 1 ? vs[0] : vs;
    }
    return out;
  };
  const onSave = () => startTransition(async () => {
    const res = await saveView(name, currentQuery());
    setMsg(res.message);
    if (res.ok) { setName(""); setEditing(false); }
  });

  if (!editing) {
    return (
      <button type="button" onClick={() => { setEditing(true); setMsg(null); }} className="ec-btn ec-btn-ghost px-3 py-2 text-xs">
        <Icon name="plus" className="h-3.5 w-3.5" /> {label}
      </button>
    );
  }
  return (
    <span className="flex items-center gap-1.5">
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder={placeholder} aria-label={placeholder} autoFocus className="input max-w-[10rem] py-1.5 text-xs" />
      <button type="button" onClick={onSave} disabled={pending || !name.trim()} className="ec-btn ec-btn-ink px-3 py-1.5 text-xs"><Icon name="check" className="h-3.5 w-3.5" /> {save}</button>
      <button type="button" onClick={() => { setEditing(false); setMsg(null); }} className="ec-btn ec-btn-ghost px-2 py-1.5 text-xs">{cancel}</button>
      {msg && <span className="text-xs text-ec-ink-3">{msg}</span>}
    </span>
  );
}

// ── saved-view switcher (applies a stored query; ✕ deletes) ───────────────────────────────────────
function ViewSwitcher({ views, allLabel }: { views: SavedView[]; allLabel: string }) {
  const tv = useTranslations("cases.views");
  const { sp, clearAll, applyQuery } = useCasesNav();
  const [pending, startTransition] = useTransition();
  if (views.length === 0) return null;

  const same = (a: string[], b: string[]) => a.length === b.length && [...a].sort().join(" ") === [...b].sort().join(" ");
  const isActive = (v: SavedView) => VIEW_KEYS.every((k) => {
    const saved = v.query[k];
    const arr = saved == null ? [] : Array.isArray(saved) ? saved : [saved];
    return same(arr, sp.getAll(k));
  });
  const anyFilter = VIEW_KEYS.some((k) => sp.getAll(k).length > 0);

  return (
    <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label={tv("aria")}>
      <button type="button" role="tab" aria-selected={!anyFilter} onClick={clearAll} className={`rounded-full px-3 py-1 text-xs font-medium transition ${!anyFilter ? "bg-ec-ink text-ec-paper" : "text-ec-ink-2 hover:bg-ec-bronze-tint"}`}>
        {allLabel}
      </button>
      {views.map((v) => (
        <span key={v.id} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition ${isActive(v) ? "bg-ec-ink text-ec-paper" : "text-ec-ink-2 hover:bg-ec-bronze-tint"}`}>
          <button type="button" role="tab" aria-selected={isActive(v)} onClick={() => applyQuery(v.query)}>{v.name}</button>
          <button
            type="button"
            aria-label={tv("deleteView", { name: v.name })}
            onClick={() => { if (window.confirm(tv("deleteConfirm", { name: v.name }))) startTransition(async () => { await deleteView(v.id); }); }}
            disabled={pending}
            className={isActive(v) ? "text-ec-paper/70 hover:text-ec-paper" : "text-ec-ink-3 hover:text-ec-danger"}
          >
            <Icon name="close" className="h-3 w-3" />
          </button>
        </span>
      ))}
    </div>
  );
}

// ── active-filter chips (full labels, ✕ each, Clear all) ──────────────────────────────────────────
function ChipRow(props: Props) {
  const tc = useTranslations("cases.console");
  const tt = useTranslations("cases.tierTabs");
  const tv = useTranslations("cases.views");
  const t = useTranslations("cases.toolbar");
  const { sp, setParam, removeValue, clearAll } = useCasesNav();

  const chips: { label: string; onRemove: () => void }[] = [];
  const tier = sp.get("tier");
  if (tier) chips.push({ label: `${tt("label")}: ${tt(tier)}`, onRemove: () => setParam("tier", "") });
  const status = sp.get("status");
  if (status) chips.push({ label: `${tc("status")}: ${tv(status)}`, onRemove: () => setParam("status", "") });
  const next = sp.get("next");
  if (next) {
    const nextLabel: Record<string, string> = { overdue: tc("overdue"), "7d": tc("next7"), "30d": tc("next30"), none: tc("noHearing") };
    chips.push({ label: `${tc("nextHearing")}: ${nextLabel[next] ?? next}`, onRemove: () => setParam("next", "") });
  }
  const facetLabel: Record<string, string> = {
    court: tc("court"), case_type: tc("caseType"), stage: tc("stage"), statuses: tc("status"),
    advocate: tc("advocate"), act: tc("act"), judge: tc("judge"),
  };
  for (const key of ["court", "case_type", "stage", "statuses", "advocate", "act", "judge"]) {
    for (const v of sp.getAll(key)) chips.push({ label: `${facetLabel[key]}: ${v}`, onRemove: () => removeValue(key, v) });
  }

  if (chips.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {chips.map((c, i) => (
        <button
          key={`${c.label}-${i}`}
          type="button"
          onClick={c.onRemove}
          className="inline-flex items-center gap-1 rounded-ec-s border border-ec-hair bg-ec-paper-3 px-2 py-0.5 text-[0.7rem] font-medium text-ec-ink-2 transition hover:border-ec-hair-strong hover:text-ec-ink"
        >
          {c.label}
          <Icon name="close" className="h-2.5 w-2.5" />
        </button>
      ))}
      <button type="button" onClick={clearAll} className="ml-1 text-[0.7rem] font-medium text-ec-ink-3 underline-offset-2 hover:text-ec-ink hover:underline">
        {t("clearAll")}
      </button>
    </div>
  );
}

// ── the Filters sheet (right drawer) — every non-dominant facet, instant-apply ────────────────────
function FiltersSheet({
  courts, caseTypes, stages, statuses, advocateGroups, actGroups, judges, onClose,
}: Props & { onClose: () => void }) {
  const t = useTranslations("cases.toolbar");
  const tc = useTranslations("cases.console");
  const { sp, setMulti, setParam, clearPanel } = useCasesNav();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [onClose]);

  const asOptions = (values: string[]): ComboOption[] => values.map((v) => ({ value: v, label: v }));
  const multi = (key: string, label: string, placeholder: string, options: ComboOption[], selectAll = true) => (
    <div>
      <p className="ec-label mb-1.5">{label}</p>
      <MultiSelect label={label} placeholder={placeholder} options={options} value={sp.getAll(key)} onChange={(v) => setMulti(key, v)} showSelectAll={selectAll} virtualized={options.length > RENDER_ALL_MAX} />
    </div>
  );
  // Variant-collapsed facet (advocate/act): one option per real entity, expands to every raw variant.
  const multiGrouped = (key: string, label: string, placeholder: string, groups: FacetGroup[]) => {
    const options: ComboOption[] = groups.map((g) => ({ value: g.values.join(GROUP_SEP), label: g.label }));
    const selectedRaw = new Set(sp.getAll(key));
    const value = options.filter((o) => o.value.split(GROUP_SEP).some((v) => selectedRaw.has(v))).map((o) => o.value);
    return (
      <div>
        <p className="ec-label mb-1.5">{label}</p>
        <MultiSelect label={label} placeholder={placeholder} options={options} value={value} onChange={(vals) => setMulti(key, vals.flatMap((v) => v.split(GROUP_SEP)))} showSelectAll={false} virtualized={options.length > RENDER_ALL_MAX} />
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={t("sheetTitle")}>
      <div className="absolute inset-0 bg-ec-ink/40" onClick={onClose} />
      <div className="absolute inset-y-0 right-0 flex w-full max-w-[380px] flex-col border-l border-ec-hair bg-ec-paper shadow-ec-2">
        <div className="flex items-start justify-between border-b border-ec-hair px-5 py-4">
          <div>
            <h2 className="font-display text-lg font-medium text-ec-ink">{t("sheetTitle")}</h2>
            <p className="mt-0.5 text-xs text-ec-ink-3">{t("sheetSubtitle")}</p>
          </div>
          <button type="button" onClick={onClose} aria-label={t("done")} className="flex h-8 w-8 items-center justify-center rounded-ec-s text-ec-ink-3 transition hover:bg-ec-paper-3 hover:text-ec-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ec-indigo">
            <Icon name="close" className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {multi("court", tc("court"), tc("allCourts"), asOptions(courts))}
          {multi("case_type", tc("caseType"), tc("allTypes"), asOptions(caseTypes))}
          {multi("stage", tc("stage"), tc("allStages"), asOptions(stages))}
          {multi("statuses", tc("status"), tc("allStatuses"), asOptions(statuses))}
          {multiGrouped("advocate", tc("advocate"), tc("allAdvocates"), advocateGroups)}
          {multiGrouped("act", tc("act"), tc("allActs"), actGroups)}
          {multi("judge", tc("judge"), tc("allJudges"), asOptions(judges), false)}
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
