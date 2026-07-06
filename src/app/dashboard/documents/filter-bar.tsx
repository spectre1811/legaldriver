"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/icons";
import { CATEGORIES } from "@/lib/docs/categories";

type Opt = { id: string; label: string };

export function FilterBar({ types, clients }: { types: string[]; clients: Opt[] }) {
  const t = useTranslations("documents");
  const router = useRouter();
  const sp = useSearchParams();
  const [q, setQ] = useState(sp.get("q") ?? "");

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(sp.toString());
    if (value) next.set(key, value); else next.delete(key);
    next.delete("page"); // WO-56: a filter change resets pagination to page 1
    router.push(`/dashboard/documents?${next.toString()}`);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <form
        onSubmit={(e) => { e.preventDefault(); setParam("q", q.trim()); }}
        className="relative min-w-[14rem] flex-1"
      >
        <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("filter.searchPlaceholder")} className="input pl-9" aria-label={t("filter.searchAria")} />
      </form>
      <select value={sp.get("client") ?? ""} onChange={(e) => setParam("client", e.target.value)} className="input max-w-[12rem]" aria-label={t("filter.clientAria")}>
        <option value="">{t("filter.allClients")}</option>
        {clients.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
      </select>
      <select value={sp.get("category") ?? ""} onChange={(e) => setParam("category", e.target.value)} className="input max-w-[12rem]" aria-label={t("filter.categoryAria")}>
        <option value="">{t("filter.allCategories")}</option>
        {CATEGORIES.map((c) => <option key={c.key} value={c.key}>{t(`filter.category.${c.key}`)}</option>)}
      </select>
      <select value={sp.get("source") ?? ""} onChange={(e) => setParam("source", e.target.value)} className="input max-w-[10rem]" aria-label={t("filter.sourceAria")}>
        <option value="">{t("filter.allSources")}</option>
        <option value="gmail">{t("filter.source.gmail")}</option>
        <option value="upload">{t("filter.source.upload")}</option>
        <option value="court_order">{t("filter.source.court_order")}</option>
      </select>
      <select value={sp.get("type") ?? ""} onChange={(e) => setParam("type", e.target.value)} className="input max-w-[11rem]" aria-label={t("filter.typeAria")}>
        <option value="">{t("filter.allTypes")}</option>
        {types.map((t2) => <option key={t2} value={t2}>{t2}</option>)}
      </select>
      <select value={sp.get("filed") ?? ""} onChange={(e) => setParam("filed", e.target.value)} className="input max-w-[9rem]" aria-label={t("filter.filedAria")}>
        <option value="">{t("filter.all")}</option>
        <option value="filed">{t("filter.filed")}</option>
        <option value="unfiled">{t("filter.unfiled")}</option>
      </select>
    </div>
  );
}
