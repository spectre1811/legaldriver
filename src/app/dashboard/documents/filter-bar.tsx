"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/icons";
import { Combobox, type ComboOption, RENDER_ALL_MAX } from "@/components/combobox";
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

  // Searchable single-select filter → URL param (`null`/cleared = "all"). WO-62.
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
    <div className="flex flex-wrap items-center gap-2">
      <form
        onSubmit={(e) => { e.preventDefault(); setParam("q", q.trim()); }}
        className="relative min-w-[14rem] flex-1"
      >
        <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("filter.searchPlaceholder")} className="input pl-9" aria-label={t("filter.searchAria")} />
      </form>
      {combo("client", t("filter.clientAria"), t("filter.allClients"), clients.map((c) => ({ value: c.id, label: c.label })), "min-w-[10rem] max-w-[13rem]")}
      {combo("category", t("filter.categoryAria"), t("filter.allCategories"), CATEGORIES.map((c) => ({ value: c.key, label: t(`filter.category.${c.key}`) })), "min-w-[10rem] max-w-[12rem]")}
      {combo("source", t("filter.sourceAria"), t("filter.allSources"), [
        { value: "gmail", label: t("filter.source.gmail") },
        { value: "upload", label: t("filter.source.upload") },
        { value: "court_order", label: t("filter.source.court_order") },
      ], "min-w-[9rem] max-w-[11rem]")}
      {combo("type", t("filter.typeAria"), t("filter.allTypes"), types.map((t2) => ({ value: t2, label: t2 })), "min-w-[10rem] max-w-[12rem]")}
      {combo("filed", t("filter.filedAria"), t("filter.all"), [
        { value: "filed", label: t("filter.filed") },
        { value: "unfiled", label: t("filter.unfiled") },
      ], "min-w-[8rem] max-w-[10rem]")}
    </div>
  );
}
