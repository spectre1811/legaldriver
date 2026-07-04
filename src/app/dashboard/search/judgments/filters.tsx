"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/icons";
import { COURT_NAMES } from "@/lib/court/corpus-athena";

// All 25 High Court codes in the corpus. Labels come from COURT_NAMES when known,
// else fall back to "Court <code>".
const COURT_CODES = [
  "SC",
  "1_12", "2_5", "3_22", "5_15", "7_26", "8_9", "9_13", "10_8", "11_24", "14_25",
  "16_20", "17_21", "18_6", "19_16", "20_7", "21_11", "22_18", "23_23", "24_17",
  "27_1", "28_2", "29_3", "32_4", "33_10", "36_29",
];

const COURTS = COURT_CODES
  .map((code) => ({ value: code, label: COURT_NAMES[code] ?? `Court ${code}` }))
  .sort((a, b) => a.label.localeCompare(b.label));

const YEARS = Array.from({ length: 2026 - 2008 + 1 }, (_, i) => 2026 - i).map((y) => String(y));

// Common disposal natures in Indian HC corpus (verified present in corpus_judgment).
// These are the standard NJDG disposal codes; displayed as-is (they're the authoritative labels).
const DISPOSAL_NATURES = [
  "Allowed", "Dismissed", "Disposed Of", "Withdrawn", "Settled",
  "Transferred", "Abated", "Struck Off",
];

export function Filters() {
  const t = useTranslations("research");
  const router = useRouter();
  const sp = useSearchParams();
  const [q, setQ] = useState(sp.get("q") ?? "");
  const [judgeQ, setJudgeQ] = useState(sp.get("judge") ?? "");

  const push = (next: URLSearchParams) => router.push(`/dashboard/search/judgments?${next.toString()}`);

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(sp.toString());
    if (value) next.set(key, value); else next.delete(key);
    push(next);
  };

  const submitSearch = () => {
    const next = new URLSearchParams(sp.toString());
    const term = q.trim();
    if (term) next.set("q", term); else next.delete("q");
    const jTerm = judgeQ.trim();
    if (jTerm) next.set("judge", jTerm); else next.delete("judge");
    push(next);
  };

  const clearAll = () => {
    setQ("");
    setJudgeQ("");
    router.push("/dashboard/search/judgments");
  };

  const hasFilters = Boolean(sp.get("q") || sp.get("court") || sp.get("year") || sp.get("disposal") || sp.get("judge"));

  return (
    <div className="space-y-2">
      {/* Row 1: text search + judge search + submit */}
      <div className="flex flex-wrap items-center gap-2">
        <form
          onSubmit={(e) => { e.preventDefault(); submitSearch(); }}
          className="relative min-w-[16rem] flex-1"
        >
          <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("searchPlaceholder")} className="input pl-9" aria-label={t("searchAria")} />
        </form>
        <form
          onSubmit={(e) => { e.preventDefault(); submitSearch(); }}
          className="relative min-w-[14rem] flex-1 sm:flex-none"
        >
          <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
          <input
            value={judgeQ}
            onChange={(e) => setJudgeQ(e.target.value)}
            placeholder={t("judgePlaceholder")}
            className="input pl-9"
            aria-label={t("judgeAria")}
          />
        </form>
        <button type="button" onClick={submitSearch} className="btn btn-primary">{t("searchButton")}</button>
        {hasFilters && (
          <button type="button" onClick={clearAll} className="text-xs font-medium text-brand-700 hover:underline">{t("clearFilters")}</button>
        )}
      </div>

      {/* Row 2: court + year + disposal facets */}
      <div className="flex flex-wrap items-center gap-2">
        <select value={sp.get("court") ?? ""} onChange={(e) => setParam("court", e.target.value)} className="input max-w-[16rem]" aria-label={t("courtAria")}>
          <option value="">{t("allCourts")}</option>
          {COURTS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
        <select value={sp.get("year") ?? ""} onChange={(e) => setParam("year", e.target.value)} className="input max-w-[9rem]" aria-label={t("yearAria")}>
          <option value="">{t("allYears")}</option>
          {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <select value={sp.get("disposal") ?? ""} onChange={(e) => setParam("disposal", e.target.value)} className="input max-w-[14rem]" aria-label={t("disposalAria")}>
          <option value="">{t("allDisposals")}</option>
          {DISPOSAL_NATURES.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
      </div>
    </div>
  );
}
