"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Combobox, type ComboOption, RENDER_ALL_MAX } from "@/components/combobox";
import { Icon } from "@/components/icons";
import { CATEGORIES } from "@/lib/docs/categories";
import { DOC_SORT_OPTIONS, parseSortBy, type DocSortBy } from "@/lib/docs/list-query";
import { DocumentsUpload } from "./documents-upload";

type Opt = { id: string; label: string };

// WO-334 EXACT-FIDELITY · node-for-node port of app.documents.tsx's search bar + controls row.
// Was a 5-filter row (client/category/source/type/filed) plus a separate "Group by" tab strip
// and a full dropzone card elsewhere on the page — none of that shape is in the reference. The
// reference has exactly: a full-text search input, a two-way case/client Segmented, three filters
// (Type/Case/Source), and one compact Upload button. "Type" binds to the real category taxonomy
// (lib/docs/categories.ts, richer than the reference's dummy 3-option list — bind to real data,
// not the dummy content, per the WO); "Case" is new (the reference has it, the prior build didn't
// expose a case filter at all); "Client" and "Filed" filters are dropped (this component's own
// case/client Segmented replaces the client filter's job; the per-row chip already shows filed
// status without a separate toggle) — not in the reference, per the WO's "add nothing not in the
// ref" / discard-prior-adaptations directive.
export function DocumentsToolbar({
  groupBy, matterOpts, showUpload, trashCount,
}: {
  groupBy: "case" | "client";
  matterOpts: Opt[];
  showUpload: boolean;
  /** Real trash count (page.tsx) — drives the toolbar Trash button's honey badge. */
  trashCount: number;
}) {
  const t = useTranslations("documents");
  const router = useRouter();
  const sp = useSearchParams();
  const [q, setQ] = useState(sp.get("q") ?? "");

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(sp.toString());
    if (value) next.set(key, value); else next.delete(key);
    next.delete("page"); // a control change resets pagination to page 1
    router.push(`/dashboard/documents?${next.toString()}`);
  };

  const combo = (key: string, label: string, placeholder: string, options: ComboOption[], width: string) => (
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

  return (
    <div className="space-y-3">
      <form
        onSubmit={(e) => { e.preventDefault(); setParam("q", q.trim()); }}
        className="relative"
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("filter.searchPlaceholder")}
          aria-label={t("filter.searchAria")}
          className="w-full rounded-lg border border-ec-line-strong bg-ec-card py-3 pl-4 pr-24 text-[14.5px] text-ec-ink outline-none transition-colors placeholder:text-ec-muted-ink focus:border-ec-bronze"
        />
        {/* Real capability signal, not decoration — the query runs Postgres full-text search.
            "bg-band" in the prototype is its OWN --band (#F1ECE1); our --paper-3 is the exact
            equivalent (tokens.css WO-331 audit note) — our different, existing --band is a
            different colour, so this deliberately isn't bg-ec-band. */}
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded bg-ec-paper-3 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em] text-ec-muted-ink">
          {t("filter.fullText")}
        </span>
      </form>

      <div className="flex flex-wrap items-center gap-2">
        <div role="tablist" aria-label={t("group.by")} className="inline-flex items-center rounded-md border border-ec-hair bg-ec-card p-[3px]">
          {(["case", "client"] as const).map((g) => {
            const active = g === groupBy;
            return (
              <button
                key={g}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setParam("group", g === "case" ? "" : g)}
                className={`rounded-[4px] px-2.5 py-1 text-[12px] font-medium transition-colors ${
                  active ? "bg-ec-bronze-tint text-ec-bronze-deep" : "text-ec-muted-ink hover:bg-ec-paper-3 hover:text-ec-ink-2"
                }`}
              >
                {t(g === "case" ? "group.tabCase" : "group.tabClient")}
              </button>
            );
          })}
        </div>
        {combo("category", t("filter.categoryAria"), t("filter.allCategories"), CATEGORIES.map((c) => ({ value: c.key, label: t(`filter.category.${c.key}`) })), "min-w-[10rem] max-w-[12rem]")}
        {combo("matter", t("filter.matterAria"), t("filter.allCases"), matterOpts.map((m) => ({ value: m.id, label: m.label })), "min-w-[10rem] max-w-[13rem]")}
        {combo("source", t("filter.sourceAria"), t("filter.allSources"), [
          { value: "gmail", label: t("filter.source.gmail") },
          { value: "upload", label: t("filter.source.upload") },
          { value: "court_order", label: t("filter.source.court_order") },
        ], "min-w-[9rem] max-w-[11rem]")}
        {/* WO-409 · Date from / Date to — native date inputs (no picker lib), real range filter
            server-side (page.tsx → lib/docs/list-query.ts dateBounds). */}
        <input
          type="date"
          value={sp.get("dateFrom") ?? ""}
          onChange={(e) => setParam("dateFrom", e.target.value)}
          aria-label={t("filter.dateFromAria")}
          className="rounded-md border border-ec-hair bg-ec-card px-2.5 py-1.5 text-[12.5px] text-ec-ink-2 outline-none transition-colors focus:border-ec-bronze"
        />
        <input
          type="date"
          value={sp.get("dateTo") ?? ""}
          onChange={(e) => setParam("dateTo", e.target.value)}
          aria-label={t("filter.dateToAria")}
          className="rounded-md border border-ec-hair bg-ec-card px-2.5 py-1.5 text-[12.5px] text-ec-ink-2 outline-none transition-colors focus:border-ec-bronze"
        />
        {/* Sort by — always has a value (no clear affordance), maps to a real .order() column
            (lib/docs/list-query.ts sortColumn), not just newest-first cosmetics. */}
        <Combobox<DocSortBy>
          label={t("filter.sortAria")}
          options={DOC_SORT_OPTIONS.map((v) => ({ value: v, label: t(`filter.sort.${v}`) }))}
          value={parseSortBy(sp.get("sortBy"))}
          onChange={(v) => setParam("sortBy", v && v !== "date_desc" ? v : "")}
          clearable={false}
          className="min-w-[10rem] max-w-[12rem]"
        />
        <div className="ml-auto flex items-center gap-2">
          {showUpload && <DocumentsUpload />}
          {/* Prominent icon-only Trash entry point — the reversible-delete home. Hover-scale
              respects prefers-reduced-motion via the global transition-duration override
              (globals.css) rather than a second, motion-specific class. */}
          <Link
            href="/dashboard/documents?trash=1"
            aria-label={t("trash.title")}
            title={t("trash.title")}
            className="relative inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-ec-s border border-ec-line bg-ec-card text-ec-ink-3 transition-transform hover:scale-105 hover:border-ec-bronze hover:text-ec-bronze"
          >
            <Icon name="trash" className="h-4 w-4" />
            {trashCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-ec-honey px-1 text-[10px] font-semibold text-ec-ink">
                {trashCount}
              </span>
            )}
          </Link>
        </div>
      </div>
    </div>
  );
}
