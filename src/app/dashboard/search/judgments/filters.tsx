"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/icons";

// WO-289 · Judgments search is now a single BM25 full-text query over `/search/order-text` (our
// own ingested order/judgment text) — the endpoint takes only `q` (no court/year/disposal/judge
// server-side facets, no offset/total), so the court/year/disposal/judge Combobox facets this page
// used to render against the retired Athena corpus are gone. A judge/coram name is still reachable —
// clicking a coram in the results re-runs the SAME `q` search on that name (see page.tsx).
export function Filters() {
  const t = useTranslations("research");
  const router = useRouter();
  const sp = useSearchParams();
  const [q, setQ] = useState(sp.get("q") ?? "");

  const submitSearch = () => {
    const term = q.trim();
    const next = new URLSearchParams();
    if (term) next.set("q", term);
    router.push(`/dashboard/search/judgments${next.toString() ? `?${next}` : ""}`);
  };

  const hasFilters = Boolean(sp.get("q"));

  return (
    <div className="flex flex-wrap items-center gap-2">
      <form onSubmit={(e) => { e.preventDefault(); submitSearch(); }} className="relative min-w-[16rem] flex-1">
        <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ec-ink-3" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("searchPlaceholder")} className="input pl-9" aria-label={t("searchAria")} />
      </form>
      <button type="button" onClick={submitSearch} className="ec-btn ec-btn-ink">{t("searchButton")}</button>
      {hasFilters && (
        <button type="button" onClick={() => { setQ(""); router.push("/dashboard/search/judgments"); }} className="text-xs font-medium text-ec-bronze-deep hover:underline">{t("clearFilters")}</button>
      )}
    </div>
  );
}
