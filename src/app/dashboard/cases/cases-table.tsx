"use client";

// WO-43-W2 · the selection-first Cases table. Replaces the read-only grid + per-row trash with a
// multi-select table + a floating bulk bar (shared WO-43 primitive), reversible delete (soft-delete
// + 10s Undo), reversible bulk stage-change, CSV export, and sortable column headers. The server
// page still does the fetch + pagination; this owns the client-side selection/sort interactions.

import { useState, type KeyboardEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/icons";
import { fmtAgo } from "@/components/ui";
import { cleanPurpose } from "@/lib/court/code-labels";
import { maskTitle } from "@/lib/court/mask";
import { CourtChip, formatCourtDate } from "@/components/court";
import {
  useSelection, useUndo, BulkBar, bulkBtn, RowCheckbox, SelectAllCheckbox, UndoToast,
} from "@/components/selection";
import { CaseDetailDrawer, UrgencyChip } from "@/components/cases/case-detail-drawer";
import { hearingUrgency, courtCaseNo } from "./cases-row";
import { DENSITIES, DENSITY_COOKIE, type Density } from "./density";
import { parseSort, toCasesCsv } from "./cases-query";
import type { MatterRow } from "./cases-query";
import {
  bulkDeleteMatters, restoreMatters, bulkSetStage, bulkRestoreStages, type StageSnapshot,
} from "./actions";

// A sortable column: `key` is the `sort` param key resolved by cases-query's allowlist.
type SortKey = "title" | "court" | "stage" | "status" | "next";

export function CasesTable({
  rows, today, stages, initialDensity = "cozy",
}: {
  rows: MatterRow[];
  today: string;
  stages: string[];
  initialDensity?: Density;
}) {
  const t = useTranslations("cases");
  const te = useTranslations("enum");
  const tcd = useTranslations("caseDetail");
  const st = (v: string) => (te.has(`status.${v}`) ? te(`status.${v}`) : v);

  const router = useRouter();
  const sp = useSearchParams();
  const orderedIds = rows.map((r) => r.id);
  const sel = useSelection(orderedIds);
  const { undo, show: showUndo, dismiss: dismissUndo } = useUndo();
  const [busy, setBusy] = useState(false);
  // WO-54 W4: per-user list density. Seeded from the server cookie (no flash); applied instantly on
  // change (client state) and persisted to the cookie so the next visit renders it server-side.
  const [density, setDensity] = useState<Density>(initialDensity);
  const changeDensity = (d: Density) => {
    setDensity(d);
    if (typeof document !== "undefined") {
      document.cookie = `${DENSITY_COOKIE}=${d}; path=/; max-age=31536000; SameSite=Lax`;
    }
  };
  // WO-54 W3: the row's "peek" — a right-side drawer with the fuller record (progressive disclosure).
  const [drawerRow, setDrawerRow] = useState<MatterRow | null>(null);
  // Prior stages captured by the last bulk stage-change, so its Undo can restore per-row values.
  const [stageUndo, setStageUndo] = useState<StageSnapshot[] | null>(null);

  const active = parseSort(sp.get("sort") ?? undefined);

  const setSort = (key: SortKey) => {
    const next = new URLSearchParams(sp.toString());
    // Toggle asc↔desc when re-clicking the active column; new column starts ascending.
    const cur = active && sortKeyOf(active.column) === key;
    const dir = cur && active!.ascending ? "desc" : "asc";
    next.set("sort", `${key}.${dir}`);
    next.delete("page"); // re-sorting returns to page 1
    router.push(`/dashboard/cases?${next.toString()}`);
  };

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    try {
      await fn();
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function onDelete() {
    const ids = [...sel.selected];
    if (!ids.length) return;
    setStageUndo(null);
    await run(async () => {
      const r = await bulkDeleteMatters(ids);
      showUndo(ids, r.message);
    });
    sel.clear();
  }
  async function onSetStage(stage: string) {
    if (!stage) return;
    const ids = [...sel.selected];
    if (!ids.length) return;
    await run(async () => {
      const r = await bulkSetStage(ids, stage);
      setStageUndo(r.prior);
      showUndo(ids, r.message);
    });
    sel.clear();
  }
  // One Undo affordance serves both reversible actions: restore stages if the last action was a
  // stage change, else un-trash the deleted ids.
  async function onUndo() {
    if (!undo) return;
    const ids = undo.ids;
    const stages = stageUndo;
    dismissUndo();
    setStageUndo(null);
    await run(() => (stages ? bulkRestoreStages(stages) : restoreMatters(ids)));
  }
  function onExport() {
    const selected = rows.filter((r) => sel.isSelected(r.id));
    if (!selected.length) return;
    downloadCsv(selected, t("bulk.exportFilename"));
  }

  // WO-54 W4b · keyboard row navigation. Arrow up/down moves row focus (roving tabindex); Enter opens
  // the detail drawer. Gated on the <tr> being the event TARGET, so a keypress inside an inner control
  // (checkbox, title link, Details button) is never hijacked — the row handler only fires when the row
  // itself holds focus.
  function onRowKeyDown(e: KeyboardEvent<HTMLTableRowElement>, m: MatterRow) {
    if (e.target !== e.currentTarget) return;
    if (e.key === "ArrowDown") { e.preventDefault(); (e.currentTarget.nextElementSibling as HTMLElement | null)?.focus(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); (e.currentTarget.previousElementSibling as HTMLElement | null)?.focus(); }
    else if (e.key === "Enter") { e.preventDefault(); setDrawerRow(m); }
  }

  return (
    <>
      {/* WO-54 W4 · density control — a segmented toggle; instant + persisted, no save button. */}
      <div className="mb-2.5 flex items-center justify-end">
        <div className="inline-flex items-center gap-0.5 rounded-full border border-ec-hair-strong p-0.5" role="group" aria-label={t("density.aria")}>
          {DENSITIES.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => changeDensity(d)}
              aria-pressed={density === d}
              title={t(`density.${d}`)}
              className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${
                density === d ? "bg-ec-ink text-paper" : "text-ec-ink-3 hover:text-ec-ink"
              }`}
            >
              {t(`density.${d}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="ec-card overflow-hidden">
        <table className="cases-table w-full text-sm" data-density={density}>
          <thead>
            <tr className="border-b border-ec-hair-strong text-left">
              <th className="w-10 px-5 py-3">
                <SelectAllCheckbox
                  checked={orderedIds.length > 0 && sel.allSelected(orderedIds)}
                  onToggle={() => sel.toggleGroup(orderedIds)}
                  label={t("bulk.selectAll")}
                />
              </th>
              <SortHeader label={t("th.case")} col="title" active={active} onSort={setSort} />
              <th className="ec-label hidden px-5 py-3 lg:table-cell">{t("th.client")}</th>
              <SortHeader label={t("th.court")} col="court" active={active} onSort={setSort} className="hidden md:table-cell" />
              <SortHeader label={t("th.stage")} col="stage" active={active} onSort={setSort} className="hidden sm:table-cell" />
              <SortHeader label={t("th.status")} col="status" active={active} onSort={setSort} className="hidden sm:table-cell" />
              <SortHeader label={t("th.next")} col="next" active={active} onSort={setSort} />
              <th className="ec-label hidden px-5 py-3 lg:table-cell">{t("th.source")}</th>
              <th className="w-10 px-3 py-3" aria-hidden="true" />
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => {
              const eff = m.next_hearing_override ?? m.next_hearing_date;
              const overdue = eff != null && eff < today;
              const checked = sel.isSelected(m.id);
              // WO-54 at-a-glance signals — all from stored fields (no fabrication).
              const detail = (m.detail ?? {}) as Record<string, unknown>;
              const caseNo = courtCaseNo(m.case_type, detail);
              const tier = typeof detail.tier === "string" && detail.tier.trim() ? detail.tier.trim() : null;
              const urg = hearingUrgency(eff, today);
              return (
                <tr
                  key={m.id}
                  tabIndex={0}
                  onKeyDown={(e) => onRowKeyDown(e, m)}
                  aria-label={t("row.aria", { title: m.title })}
                  className={`ec-row group border-b border-ec-hair last:border-0 focus:outline-none focus-visible:bg-ec-brass-tint focus-visible:shadow-[inset_2px_0_0_0_var(--brass)] ${checked ? "bg-ec-brass-tint" : ""}`}
                >
                  <td className="px-5 py-3.5">
                    <RowCheckbox checked={checked} onSelect={(shift) => sel.onRowClick(m.id, shift)} label={t("bulk.selectRow", { title: m.title })} />
                  </td>
                  <td className="px-5 py-3.5">
                    <Link href={`/dashboard/cases/${m.id}`} className="font-display font-medium text-ec-ink group-hover:text-ec-brass-deep">
                      {maskTitle(m.title, tcd("maskedTitle"))}
                    </Link>
                    {(caseNo || tier || m.cnr) && (
                      <div className="cases-subline mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[0.7rem] text-ec-ink-3">
                        {caseNo && <span className="num text-ec-ink-2">{caseNo}</span>}
                        {tier && <CourtChip tone="neutral">{tier}</CourtChip>}
                        {m.cnr && <span className="num">{m.cnr}</span>}
                      </div>
                    )}
                  </td>
                  <td className="hidden px-5 py-3.5 text-ec-ink-2 lg:table-cell">{m.client?.name ?? <span className="text-ec-ink-3">—</span>}</td>
                  <td className="hidden px-5 py-3.5 text-ec-ink-2 md:table-cell">{m.court ?? "—"}</td>
                  <td className="hidden px-5 py-3.5 sm:table-cell">{m.stage ? <span className="ec-chip" title={m.stage}>{cleanPurpose(m.stage)}</span> : <span className="text-ec-ink-3">—</span>}</td>
                  <td className="hidden px-5 py-3.5 sm:table-cell">
                    {m.status ? <span className={`ec-chip ${m.status === "disposed" ? "" : "ec-chip-hot"}`}>{st(m.status)}</span> : <span className="text-ec-ink-3">—</span>}
                  </td>
                  <td className="num px-5 py-3.5">
                    {eff ? (
                      <span className="inline-flex flex-wrap items-center gap-1.5">
                        <span className={overdue ? "font-medium text-ec-danger" : "text-ec-ink-2"}>{(formatCourtDate(eff) ?? "—")}</span>
                        {m.next_hearing_override && <span className="text-[0.7rem] text-ec-ink-3">{t("diary")}</span>}
                        <UrgencyChip urg={urg} t={t} />
                      </span>
                    ) : <span className="text-xs text-ec-ink-3">{t("noDate")}</span>}
                  </td>
                  <td className="num hidden px-5 py-3.5 text-xs text-ec-ink-3 lg:table-cell">{m.source ?? "—"} · {fmtAgo(m.last_synced_at)}</td>
                  <td className="px-3 py-3.5 text-right">
                    <button
                      type="button"
                      onClick={() => setDrawerRow(m)}
                      aria-label={t("drawer.openAria", { title: m.title })}
                      className="rounded-full p-1.5 text-ec-ink-3 opacity-70 transition hover:bg-ec-hair hover:text-ec-brass-deep focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ec-brass group-hover:opacity-100"
                    >
                      <Icon name="eye" className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Floating bulk-action bar — appears on selection (shared WO-43 primitive). */}
      <BulkBar count={sel.size} label={t("bulk.selected", { n: sel.size })} clearLabel={t("bulk.clear")} onClear={sel.clear}>
        <select
          onChange={(e) => { onSetStage(e.target.value); e.currentTarget.selectedIndex = 0; }}
          disabled={busy}
          defaultValue=""
          className="rounded-full bg-paper/15 px-3 py-1 text-sm text-paper focus:outline-none"
          aria-label={t("bulk.setStage")}
        >
          <option value="" className="text-ink">{t("bulk.setStage")}</option>
          {stages.map((s) => <option key={s} value={s} className="text-ink">{cleanPurpose(s)}</option>)}
        </select>
        <button onClick={onExport} disabled={busy} className={bulkBtn}>{t("bulk.export")}</button>
        <button onClick={onDelete} disabled={busy} className={`${bulkBtn} text-red-300`}>{t("bulk.delete")}</button>
      </BulkBar>

      <UndoToast undo={undo} actionLabel={t("bulk.undo")} onUndo={onUndo} />

      {/* WO-54 W3 · detail drawer — renders from the already-fetched row (no second query). */}
      <CaseDetailDrawer row={drawerRow} today={today} onClose={() => setDrawerRow(null)} />
    </>
  );
}

// A clickable, sort-toggling column header with an active-direction caret.
function SortHeader({
  label, col, active, onSort, className = "",
}: {
  label: string;
  col: SortKey;
  active: { column: string; ascending: boolean } | null;
  onSort: (key: SortKey) => void;
  className?: string;
}) {
  const isActive = active != null && sortKeyOf(active.column) === col;
  return (
    <th className={`ec-label px-5 py-3 ${className}`}>
      <button type="button" onClick={() => onSort(col)} className="group/sort inline-flex items-center gap-1 hover:text-ec-brass-deep">
        {label}
        {/* One right-pointing chevron rotated to a caret: up = ascending, down = descending. */}
        <Icon
          name="chevron"
          className={`h-3 w-3 transition ${isActive ? `text-ec-brass-deep ${active!.ascending ? "-rotate-90" : "rotate-90"}` : "rotate-90 text-ec-ink-3 opacity-0 group-hover/sort:opacity-60"}`}
        />
      </button>
    </th>
  );
}

// Reverse-map a resolved column name back to its sort key (headers speak in keys).
function sortKeyOf(column: string): SortKey | null {
  switch (column) {
    case "title": return "title";
    case "court": return "court";
    case "stage": return "stage";
    case "status": return "status";
    case "next_hearing_date": return "next";
    default: return null;
  }
}

// Download a CSV of the selected rows, client-side (selection is bounded to the page). The CSV body
// is built by the pure `toCasesCsv` (unit-tested); here we just add a BOM + trigger the download.
function downloadCsv(rows: MatterRow[], filename: string) {
  const blob = new Blob(["﻿" + toCasesCsv(rows)], { type: "text/csv;charset=utf-8" }); // BOM → Excel reads UTF-8
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
