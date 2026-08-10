"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Combobox, type ComboOption, RENDER_ALL_MAX } from "@/components/combobox";
import { CATEGORIES } from "@/lib/docs/categories";
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
  groupBy, matterOpts, showUpload,
}: {
  groupBy: "case" | "client";
  matterOpts: Opt[];
  showUpload: boolean;
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
        {showUpload && <DocumentsUpload className="ml-auto" />}
      </div>
    </div>
  );
}
