"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/icons";
import { Combobox, type ComboOption, RENDER_ALL_MAX } from "@/components/combobox";
import { saveView } from "./view-actions";

// Query keys the console owns. Used to (re)build the URL and to snapshot a saved view.
const KEYS = ["q", "court", "case_type", "stage", "status", "advocate", "act", "next", "sort"] as const;

export type SavedView = { id: string; name: string; query: Record<string, string> };

export function Console({
  courts,
  caseTypes,
  stages,
  advocates,
  acts,
}: {
  courts: string[];
  caseTypes: string[];
  stages: string[];
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

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(sp.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    push(next);
  };

  // A searchable single-select filter → sets/clears the URL param. `null` (cleared) = "all"/default.
  const asOptions = (values: string[]): ComboOption[] => values.map((v) => ({ value: v, label: v }));
  const filter = (
    key: string,
    label: string,
    placeholder: string,
    options: ComboOption[],
    width: string,
  ) => (
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
          <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ec-ink-3" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("searchPlaceholder")}
            className="input pl-9"
            aria-label={t("searchAria")}
          />
        </form>

        {filter("court", t("court"), t("allCourts"), asOptions(courts), "min-w-[10rem] max-w-[13rem]")}
        {filter("case_type", t("caseType"), t("allTypes"), asOptions(caseTypes), "min-w-[10rem] max-w-[12rem]")}
        {filter("stage", t("stage"), t("allStages"), asOptions(stages), "min-w-[10rem] max-w-[12rem]")}
        {filter("status", t("status"), t("allStatuses"), [
          { value: "open", label: t("open") },
          { value: "disposed", label: t("disposed") },
        ], "min-w-[9rem] max-w-[11rem]")}
        {filter("advocate", t("advocate"), t("allAdvocates"), asOptions(advocates), "min-w-[10rem] max-w-[13rem]")}
        {filter("act", t("act"), t("allActs"), asOptions(acts), "min-w-[10rem] max-w-[13rem]")}
        {filter("next", t("nextHearing"), t("anyHearing"), [
          { value: "overdue", label: t("overdue") },
          { value: "7d", label: t("next7") },
          { value: "30d", label: t("next30") },
          { value: "none", label: t("noHearing") },
        ], "min-w-[9rem] max-w-[12rem]")}
        {filter("sort", t("sort"), t("sortNext"), [
          { value: "created_at", label: t("sortRecent") },
          { value: "title", label: t("sortTitle") },
        ], "min-w-[10rem] max-w-[12rem]")}
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
