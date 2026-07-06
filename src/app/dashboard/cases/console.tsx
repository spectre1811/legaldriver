"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/icons";
import { Combobox, MultiSelect, type ComboOption, RENDER_ALL_MAX } from "@/components/combobox";
import { saveView } from "./view-actions";

// Query keys the console owns. Used to (re)build the URL and to snapshot a saved view. The facet
// filters are MULTI (repeated params); `status` (semantic tab), `q`, `next`, `sort` are single.
const KEYS = ["q", "court", "case_type", "stage", "status", "statuses", "advocate", "act", "next", "sort"] as const;
const MULTI = new Set<string>(["court", "case_type", "stage", "statuses", "advocate", "act"]);

export type SavedView = { id: string; name: string; query: Record<string, string | string[]> };

export function Console({
  courts,
  caseTypes,
  stages,
  statuses,
  advocates,
  acts,
}: {
  courts: string[];
  caseTypes: string[];
  stages: string[];
  statuses: string[];
  advocates: string[];
  acts: string[];
}) {
  const t = useTranslations("cases.console");
  const router = useRouter();
  const sp = useSearchParams();
  const [q, setQ] = useState(sp.get("q") ?? "");
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const push = (next: URLSearchParams) => router.push(next.toString() ? `/dashboard/cases?${next.toString()}` : "/dashboard/cases");

  // A changed filter always returns to page 1 (the old page number is meaningless against a new set).
  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(sp.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete("page");
    push(next);
  };

  // Multi-valued facet → repeated params (`?court=A&court=B`), comma-safe for values with commas.
  const setMulti = (key: string, values: string[]) => {
    const next = new URLSearchParams(sp.toString());
    next.delete(key);
    next.delete("page");
    for (const v of values) next.append(key, v);
    push(next);
  };

  const asOptions = (values: string[]): ComboOption[] => values.map((v) => ({ value: v, label: v }));

  // A searchable single-select filter (hearing window, sort) → sets/clears one URL param.
  const single = (key: string, label: string, placeholder: string, options: ComboOption[], width: string) => (
    <Combobox
      label={label}
      placeholder={placeholder}
      options={options}
      value={sp.get(key) ?? null}
      onChange={(v) => setParam(key, v ?? "")}
      virtualized={options.length > RENDER_ALL_MAX}
      className={width}
    />
  );

  // A searchable multi-select facet (WO-59) → repeated URL params, select-all + chips + search.
  const multi = (key: string, label: string, placeholder: string, options: ComboOption[], width: string, selectAll = true) => (
    <MultiSelect
      label={label}
      placeholder={placeholder}
      options={options}
      value={sp.getAll(key)}
      onChange={(v) => setMulti(key, v)}
      showSelectAll={selectAll}
      virtualized={options.length > RENDER_ALL_MAX}
      className={width}
    />
  );

  const currentQuery = () => {
    const out: Record<string, string | string[]> = {};
    for (const k of KEYS) {
      if (k === "q") {
        const v = q.trim();
        if (v) out.q = v;
        continue;
      }
      if (MULTI.has(k)) {
        const vs = sp.getAll(k);
        if (vs.length) out[k] = vs.length === 1 ? vs[0] : vs;
        continue;
      }
      const v = sp.get(k);
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

  return (
    <div className="space-y-3">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setParam("q", q.trim());
        }}
        className="relative"
      >
        <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ec-ink-3" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("searchPlaceholder")}
          className="input pl-9"
          aria-label={t("searchAria")}
        />
      </form>

      {/* Modern filter bar (WO-62 adopted the combobox; WO-59 upgrades the facets to multi-select +
          adds the real-status control). Facet filters are multi; hearing-window + sort stay single. */}
      <div data-testid="cases-filter-bar" className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {multi("court", t("court"), t("allCourts"), asOptions(courts), "")}
        {multi("case_type", t("caseType"), t("allTypes"), asOptions(caseTypes), "")}
        {multi("stage", t("stage"), t("allStages"), asOptions(stages), "")}
        {multi("statuses", t("status"), t("allStatuses"), asOptions(statuses), "")}
        {multi("advocate", t("advocate"), t("allAdvocates"), asOptions(advocates), "", false)}
        {multi("act", t("act"), t("allActs"), asOptions(acts), "", false)}
        {single("next", t("nextHearing"), t("anyHearing"), [
          { value: "overdue", label: t("overdue") },
          { value: "7d", label: t("next7") },
          { value: "30d", label: t("next30") },
          { value: "none", label: t("noHearing") },
        ], "")}
        {single("sort", t("sort"), t("sortNext"), [
          { value: "created_at", label: t("sortRecent") },
          { value: "title", label: t("sortTitle") },
        ], "")}
      </div>

      {/* Saved views render as the tab strip (CasesTabs); the Console just saves the current query. */}
      <div className="flex flex-wrap items-center gap-2">
        {saving ? (
          <span className="flex items-center gap-1.5">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("viewName")}
              className="input max-w-[10rem] py-1.5 text-xs"
              aria-label={t("viewName")}
              autoFocus
            />
            <button type="button" onClick={onSave} disabled={pending} className="ec-btn ec-btn-ink px-3 py-1.5 text-xs">
              <Icon name="check" className="h-3.5 w-3.5" /> {t("save")}
            </button>
            <button type="button" onClick={() => { setSaving(false); setMsg(null); }} className="ec-btn ec-btn-ghost px-2 py-1.5 text-xs">
              {t("cancel")}
            </button>
          </span>
        ) : (
          <button type="button" onClick={() => { setSaving(true); setMsg(null); }} className="ec-btn ec-btn-ghost px-3 py-1.5 text-xs">
            <Icon name="plus" className="h-3.5 w-3.5" /> {t("saveView")}
          </button>
        )}

        {msg && <span className="text-xs text-ec-ink-3">{msg}</span>}
      </div>
    </div>
  );
}
