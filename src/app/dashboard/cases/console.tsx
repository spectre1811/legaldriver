"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/icons";
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

        <select value={sp.get("court") ?? ""} onChange={(e) => setParam("court", e.target.value)} className="input max-w-[12rem]" aria-label={t("court")}>
          <option value="">{t("allCourts")}</option>
          {courts.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>

        <select value={sp.get("case_type") ?? ""} onChange={(e) => setParam("case_type", e.target.value)} className="input max-w-[11rem]" aria-label={t("caseType")}>
          <option value="">{t("allTypes")}</option>
          {caseTypes.map((ct) => <option key={ct} value={ct}>{ct}</option>)}
        </select>

        <select value={sp.get("stage") ?? ""} onChange={(e) => setParam("stage", e.target.value)} className="input max-w-[11rem]" aria-label={t("stage")}>
          <option value="">{t("allStages")}</option>
          {stages.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>

        <select value={sp.get("status") ?? ""} onChange={(e) => setParam("status", e.target.value)} className="input max-w-[10rem]" aria-label={t("status")}>
          <option value="">{t("allStatuses")}</option>
          <option value="open">{t("open")}</option>
          <option value="disposed">{t("disposed")}</option>
        </select>

        <select value={sp.get("advocate") ?? ""} onChange={(e) => setParam("advocate", e.target.value)} className="input max-w-[12rem]" aria-label={t("advocate")}>
          <option value="">{t("allAdvocates")}</option>
          {advocates.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>

        <select value={sp.get("act") ?? ""} onChange={(e) => setParam("act", e.target.value)} className="input max-w-[12rem]" aria-label={t("act")}>
          <option value="">{t("allActs")}</option>
          {acts.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>

        <select value={sp.get("next") ?? ""} onChange={(e) => setParam("next", e.target.value)} className="input max-w-[11rem]" aria-label={t("nextHearing")}>
          <option value="">{t("anyHearing")}</option>
          <option value="overdue">{t("overdue")}</option>
          <option value="7d">{t("next7")}</option>
          <option value="30d">{t("next30")}</option>
          <option value="none">{t("noHearing")}</option>
        </select>

        <select value={sp.get("sort") ?? ""} onChange={(e) => setParam("sort", e.target.value)} className="input max-w-[12rem]" aria-label={t("sort")}>
          <option value="">{t("sortNext")}</option>
          <option value="created_at">{t("sortRecent")}</option>
          <option value="title">{t("sortTitle")}</option>
        </select>
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
