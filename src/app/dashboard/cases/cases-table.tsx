"use client";

import Link from "next/link";
import { useCallback } from "react";
import { useTranslations } from "next-intl";
import { fmtDate, fmtAgo } from "@/components/ui";
import { Icon } from "@/components/icons";
import { PaginatedList } from "@/components/paginated-list";
import { ConfirmDelete } from "@/components/confirm-delete";
import { cleanPurpose } from "@/lib/court/code-labels";
import { deleteMatter } from "./actions";
import { loadMoreCases } from "./actions";
import type { CasesFilters, MatterRow } from "./cases-query";

function isoDay(d: Date) {
  return d.toISOString().slice(0, 10);
}

// The cases list, offset-paginated (WO-39). The server renders page 1; "Load more"
// appends further pages via loadMoreCases (which replays the same filters + sort). The
// per-row markup lives here so appended pages render identically to the first. The page
// keys this component by the active filter signature, so a filter change remounts it
// with a fresh first page instead of appending onto stale rows.
export function CasesTable({
  initialRows,
  initialCursor,
  filters,
  activeFilters,
}: {
  initialRows: MatterRow[];
  initialCursor: string | null;
  filters: CasesFilters;
  activeFilters: boolean;
}) {
  const t = useTranslations("cases");
  const te = useTranslations("enum");
  const st = (v: string) => (te.has(`status.${v}`) ? te(`status.${v}`) : v);
  const today = isoDay(new Date());

  // Bind the current filters into the load-more call the primitive drives.
  const loadMore = useCallback((cursor: string) => loadMoreCases(filters, cursor), [filters]);

  return (
    <PaginatedList
      initialRows={initialRows}
      initialCursor={initialCursor}
      loadMore={loadMore}
      empty={
        <div className="ec-card flex flex-col items-center justify-center px-6 py-14 text-center">
          <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-ec-m bg-ec-brass-tint text-ec-brass-deep">
            <Icon name="cases" className="h-5 w-5" />
          </span>
          <h3 className="font-display text-lg font-medium text-ec-ink">{activeFilters ? t("empty.filteredTitle") : t("empty.title")}</h3>
          <p className="mx-auto mt-1 max-w-md text-sm text-ec-ink-3">{activeFilters ? t("empty.filteredBody") : t("empty.body")}</p>
        </div>
      }
    >
      {(rows) => (
        <div className="ec-card overflow-hidden">
          <div className="num flex items-center justify-between border-b border-ec-hair px-5 py-2.5 text-xs text-ec-ink-3">
            <span>{t("count", { count: rows.length })}{activeFilters ? ` · ${t("filtered")}` : ""}</span>
            {activeFilters && (
              <Link href="/dashboard/cases" className="inline-flex items-center gap-1 hover:text-ec-brass-deep">
                <Icon name="refresh" className="h-3.5 w-3.5" /> {t("clearFilters")}
              </Link>
            )}
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ec-hair-strong text-left">
                <th className="ec-label px-5 py-3">{t("th.case")}</th>
                <th className="ec-label hidden px-5 py-3 lg:table-cell">{t("th.client")}</th>
                <th className="ec-label hidden px-5 py-3 md:table-cell">{t("th.court")}</th>
                <th className="ec-label hidden px-5 py-3 sm:table-cell">{t("th.stage")}</th>
                <th className="ec-label hidden px-5 py-3 sm:table-cell">{t("th.status")}</th>
                <th className="ec-label px-5 py-3">{t("th.next")}</th>
                <th className="ec-label hidden px-5 py-3 lg:table-cell">{t("th.source")}</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => {
                const eff = m.next_hearing_override ?? m.next_hearing_date;
                const overdue = eff != null && eff < today;
                return (
                  <tr key={m.id} className="ec-row group border-b border-ec-hair last:border-0">
                    <td className="px-5 py-3.5">
                      <Link href={`/dashboard/cases/${m.id}`} className="font-display font-medium text-ec-ink group-hover:text-ec-brass-deep">
                        {m.title}
                      </Link>
                      {m.cnr && <div className="num mt-0.5 text-[0.7rem] text-ec-ink-3">{m.cnr}</div>}
                    </td>
                    <td className="hidden px-5 py-3.5 text-ec-ink-2 lg:table-cell">{m.client?.name ?? <span className="text-ec-ink-3">—</span>}</td>
                    <td className="hidden px-5 py-3.5 text-ec-ink-2 md:table-cell">{m.court ?? "—"}</td>
                    <td className="hidden px-5 py-3.5 sm:table-cell">{m.stage ? <span className="ec-chip" title={m.stage}>{cleanPurpose(m.stage)}</span> : <span className="text-ec-ink-3">—</span>}</td>
                    <td className="hidden px-5 py-3.5 sm:table-cell">
                      {m.status ? <span className={`ec-chip ${m.status === "disposed" ? "" : "ec-chip-hot"}`}>{st(m.status)}</span> : <span className="text-ec-ink-3">—</span>}
                    </td>
                    <td className="num px-5 py-3.5">
                      {eff ? <span className={overdue ? "font-medium text-ec-danger" : "text-ec-ink-2"}>{fmtDate(eff)}{m.next_hearing_override ? ` · ${t("diary")}` : ""}{overdue ? ` · ${t("past")}` : ""}</span> : <span className="text-xs text-ec-ink-3">{t("noDate")}</span>}
                    </td>
                    <td className="num hidden px-5 py-3.5 text-xs text-ec-ink-3 lg:table-cell">{m.source ?? "—"} · {fmtAgo(m.last_synced_at)}</td>
                    <td className="px-5 py-3.5 text-right">
                      <ConfirmDelete action={deleteMatter} id={m.id} label="" confirmLabel={t("delete")} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </PaginatedList>
  );
}
