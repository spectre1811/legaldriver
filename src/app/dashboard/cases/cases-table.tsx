"use client";

// WO-43-W2 · the selection-first Cases table. Replaces the read-only grid + per-row trash with a
// multi-select table + a floating bulk bar (shared WO-43 primitive), reversible delete (soft-delete
// + 10s Undo), reversible bulk stage-change, CSV export, and sortable column headers. The server
// page still does the fetch + pagination; this owns the client-side selection/sort interactions.

import { useMemo, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Icon } from "@/components/icons";
import { cleanPurpose } from "@/lib/court/code-labels";
import { maskTitle } from "@/lib/court/mask";
import { formatCourtDate, stalenessState, relativeAge } from "@/components/court";
import {
  useSelection, useUndo, BulkBar, bulkBtn, RowCheckbox, SelectAllCheckbox, UndoToast,
} from "@/components/selection";
import { CaseDetailDrawer, UrgencyChip } from "@/components/cases/case-detail-drawer";
import { usePersistedState } from "@/lib/hooks/use-persisted-state";
import { hearingUrgency, courtCaseNo } from "./cases-row";
import { DENSITIES, DENSITY_STORAGE_KEY, parseDensity, type Density } from "./density";
import { parseSort, toCasesCsv } from "./cases-query";
import type { MatterRow } from "./cases-query";
import { useCasesNav } from "./cases-nav";
import {
  bulkDeleteMatters, restoreMatters, bulkSetStage, bulkRestoreStages, type StageSnapshot,
} from "./actions";

// A sortable column: `key` is the `sort` param key resolved by cases-query's allowlist.
type SortKey = "title" | "court" | "stage" | "status" | "next";

// WO-331 Daybreak reskin · the per-row "Synced" dot's freshness bar. The product already promises
// "refreshed nightly" (cases.subtitle) — real, so past 48h the sync is honestly no longer "fresh".
// A SEPARATE, longer bar (STALE_SYNC_DAYS in cases-query.ts) gates the attention-strip's "stale
// records" bucket — the dot flags routine lag; that strip flags "this needs you".
const SYNCED_FRESH_SLO_HOURS = 48;

export function CasesTable({
  rows, today, stages, initialDensity = "comfortable",
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
  const locale = useLocale();

  const router = useRouter();
  const sp = useSearchParams();
  const orderedIds = rows.map((r) => r.id);
  const sel = useSelection(orderedIds);
  const { undo, show: showUndo, dismiss: dismissUndo } = useUndo();
  const [busy, setBusy] = useState(false);
  // WO-405 C4: per-user list density, persisted via the shared usePersistedState hook
  // (mukadma:cases:density in localStorage — was a cookie, see density.ts). `initialDensity` seeds
  // the first render (SSR-matching); the hook hydrates the real stored value right after mount.
  // usePersistedState doesn't validate the stored shape (a generic hook, by design) — parseDensity
  // guards a corrupted/stale localStorage value the same way page.tsx's old cookie read did.
  const [storedDensity, changeDensity] = usePersistedState<Density>(DENSITY_STORAGE_KEY, initialDensity);
  const density = parseDensity(storedDensity);
  // WO-54 W3: the row's "peek" — a right-side drawer with the fuller record (progressive disclosure).
  const [drawerRow, setDrawerRow] = useState<MatterRow | null>(null);
  // Prior stages captured by the last bulk stage-change, so its Undo can restore per-row values.
  const [stageUndo, setStageUndo] = useState<StageSnapshot[] | null>(null);

  // WO-331 Daybreak reskin · List/Agenda view toggle (reference: cases.tsx's `view` state). WO-331
  // EXACT-FIDELITY: `view` now lives in the shared CasesNav context (cases-nav.ts), not local state
  // here — the reference puts the toggle in its command row (cases-toolbar.tsx), not above the
  // table, so toolbar and table have to share one value. Agenda groups the SAME page of `rows` this
  // component already has by real upcoming hearing date — no second fetch, no full-account scan.
  // It's honestly scoped to the current filtered/paginated page, same as the table itself; there's
  // no per-hearing TIME or courtroom field in the data model (the reference's dummy "10:30"/"Court
  // 12" columns), so those are dropped rather than fabricated.
  const { view } = useCasesNav();
  const agenda = useMemo(() => {
    const upcoming = rows
      .map((r) => ({ row: r, eff: r.next_hearing_override ?? r.next_hearing_date }))
      .filter((x): x is { row: MatterRow; eff: string } => x.eff != null && x.eff >= today)
      .sort((a, b) => (a.eff < b.eff ? -1 : a.eff > b.eff ? 1 : 0));
    const groups = new Map<string, MatterRow[]>();
    for (const { row, eff } of upcoming) {
      const day = eff.slice(0, 10);
      (groups.get(day) ?? groups.set(day, []).get(day)!).push(row);
    }
    return [...groups.entries()].map(([day, items]) => ({ day, items }));
  }, [rows, today]);
  // Locale-aware short weekday (native Intl, matches the app's existing today-view.tsx pattern) —
  // UTC-pinned so the day label never rolls across a client-timezone midnight.
  const dow = (isoDay: string) =>
    new Intl.DateTimeFormat(locale === "hi" ? "hi-IN" : "en-IN", { weekday: "short", timeZone: "UTC" }).format(
      new Date(`${isoDay}T00:00:00Z`),
    );

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
      {/* WO-331 EXACT-FIDELITY: the reference's density row is list-view-only, right-aligned, plain
          text buttons (not a bordered pill group) — matched here; List/Agenda itself moved into the
          toolbar's command row (cases-toolbar.tsx), same as the reference. */}
      {view === "list" && (
        <div className="mb-2.5 flex items-center justify-end gap-3" role="group" aria-label={t("density.aria")}>
          {DENSITIES.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => changeDensity(d)}
              aria-pressed={density === d}
              className={`text-[12px] capitalize transition-colors ${
                density === d ? "font-medium text-ec-ink" : "text-ec-muted-ink hover:text-ec-ink-2"
              }`}
            >
              {t(`density.${d}`)}
            </button>
          ))}
        </div>
      )}

      {view === "list" ? (
      <div className="ec-card stagger overflow-hidden">
        {/* WO-331 render-inspect @768: our real dashboard shell keeps a fixed 256px sidebar (unlike
            the reference's own AppShell), so the card's content area is narrower than the reference
            ever has to plan for — Court + Next hearing + the merged actions/synced column can't all
            fit below `lg`. Both moved from the reference's implied `sm`/no-breakpoint to `lg`, so at
            tablet widths the table falls back to the existing mobile combined court+date line
            instead of clipping columns against the card's `overflow-hidden`. `overflow-x-auto` here
            (not on the outer card, which keeps its rounded-corner clip) is a second line of defence
            so nothing is ever silently unreachable, even at an in-between width. */}
        <div className="overflow-x-auto">
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
              <SortHeader label={t("th.court")} col="court" active={active} onSort={setSort} className="hidden lg:table-cell" />
              <SortHeader label={t("th.next")} col="next" active={active} onSort={setSort} className="w-44" />
              {/* WO-331 EXACT-FIDELITY: the reference's 5th grid column (row actions + the synced
                  dot, combined) has no visible header label at all — matched here; "Synced" stays
                  as an sr-only label so the column keeps a real accessible name. */}
              <th className="hidden w-20 px-3 py-3 text-right lg:table-cell">
                <span className="sr-only">{t("th.synced")}</span>
              </th>
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
              // WO-331: disposed is the one status worth a chip inline (matches case-detail-drawer's
              // substring convention so the two surfaces never disagree on what counts as disposed).
              const isDisposed = (m.status ?? "").toUpperCase().includes("DISPOSED");
              // Synced dot — real freshness off `last_synced_at`; never synced reads as not-fresh,
              // honestly labelled rather than defaulting to a false-fresh green.
              const fresh = m.last_synced_at != null && !stalenessState(m.last_synced_at, SYNCED_FRESH_SLO_HOURS).stale;
              const syncedTitle = m.last_synced_at
                ? t("th.syncedTitle", { source: m.source ?? t("th.manualSource"), ago: relativeAge(m.last_synced_at) })
                : t("th.neverSynced");
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
                    <div className="flex items-center gap-2">
                      <Link href={`/dashboard/cases/${m.id}`} className="font-display font-medium text-ec-ink group-hover:text-ec-brass-deep">
                        {maskTitle(m.title, tcd("maskedTitle"))}
                      </Link>
                      {isDisposed && <span className="ec-chip shrink-0">{st(m.status!)}</span>}
                    </div>
                    {/* WO-346: the reference's row subline is one continuous mono string
                        ("FA/5053/2022 · HIGH · GJHC240820012022") — matched here (was a row of
                        separate chip pills); same real fields, just joined as plain text. */}
                    {(caseNo || tier || m.stage || m.client?.name || m.cnr) && (
                      <div className="cases-subline num mt-0.5 truncate font-mono text-[11px] text-ec-ink-3">
                        {[caseNo, tier, m.stage ? cleanPurpose(m.stage) : null, m.client?.name, m.cnr]
                          .filter(Boolean)
                          .join(" · ")}
                      </div>
                    )}
                    {/* Mobile fallback — court + next hearing collapse here once the dedicated columns hide. */}
                    <div className="num mt-1 text-[11px] text-ec-ink-3 lg:hidden">
                      {[m.court, eff ? (formatCourtDate(eff) ?? null) : t("noDate")].filter(Boolean).join(" · ")}
                    </div>
                  </td>
                  <td className="hidden px-5 py-3.5 text-ec-ink-2 lg:table-cell">{m.court ?? "—"}</td>
                  <td className="num px-5 py-3.5">
                    {eff ? (
                      <span className="inline-flex flex-wrap items-center gap-1.5">
                        <span className={overdue ? "font-medium text-ec-danger" : "text-ec-ink-2"}>{(formatCourtDate(eff) ?? "—")}</span>
                        {m.next_hearing_override && <span className="text-[0.7rem] text-ec-ink-3">{t("diary")}</span>}
                        <UrgencyChip urg={urg} t={t} />
                      </span>
                    ) : <span className="text-xs text-ec-ink-3">{t("noDate")}</span>}
                  </td>
                  {/* WO-331 EXACT-FIDELITY: the reference combines the row-hover action cluster and
                      the synced dot into ONE trailing column (its 78px grid track), not two separate
                      ones — merged here to match. "Open" is real (the existing drawer). "Cause list"
                      is real — legaldriver already has /dashboard/cause-list; not deep-linked per row
                      (no reliable court-id on the record to scope it), still a genuine destination.
                      WO-376 B8: the disabled "Add note / Coming soon" action removed — no backing
                      capability anywhere in the app, and the founder cut it rather than keep it faked. */}
                  <td className="hidden px-3 py-3.5 text-right lg:table-cell">
                    <div className="flex items-center justify-end gap-1">
                      <div className="flex items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                        <button
                          type="button"
                          onClick={() => setDrawerRow(m)}
                          aria-label={t("drawer.openAria", { title: m.title })}
                          className="rounded-full p-1.5 text-ec-ink-3 transition hover:bg-ec-hair hover:text-ec-brass-deep focus-visible:ring-2 focus-visible:ring-ec-brass"
                        >
                          <Icon name="eye" className="h-4 w-4" />
                        </button>
                        <Link
                          href="/dashboard/cause-list"
                          aria-label={t("row.causeList")}
                          title={t("row.causeList")}
                          className="rounded-full p-1.5 text-ec-ink-3 transition hover:bg-ec-hair hover:text-ec-brass-deep focus-visible:ring-2 focus-visible:ring-ec-brass"
                        >
                          <Icon name="calendar" className="h-4 w-4" />
                        </Link>
                      </div>
                      <span
                        title={syncedTitle}
                        aria-label={syncedTitle}
                        className={`ml-1 inline-block h-2 w-2 shrink-0 rounded-full ${fresh ? "bg-ec-success" : "bg-ec-hair-strong"}`}
                      />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      </div>
      ) : (
        <div className="stagger space-y-6">
          {agenda.map((g) => (
            <section key={g.day}>
              <div className="flex items-baseline gap-3 border-b border-ec-hair pb-2">
                <h2 className="display text-[19px] uppercase text-ec-ink">
                  {dow(g.day)} {formatCourtDate(g.day) ?? g.day}
                </h2>
                <span className="num font-mono text-[11px] uppercase tracking-[0.1em] text-ec-ink-3">
                  {t("agenda.count", { n: g.items.length })}
                </span>
              </div>
              <div className="divide-y divide-ec-hair">
                {g.items.map((r) => {
                  const rDetail = (r.detail ?? {}) as Record<string, unknown>;
                  const rCaseNo = courtCaseNo(r.case_type, rDetail) ?? r.cnr;
                  return (
                    <Link
                      key={r.id}
                      href={`/dashboard/cases/${r.id}`}
                      className="ec-row block py-3 transition-colors hover:bg-ec-bronze-tint/25"
                    >
                      <span className="display block truncate text-[15px] text-ec-ink hover:underline">
                        {maskTitle(r.title, tcd("maskedTitle"))}
                      </span>
                      {(r.court || rCaseNo) && (
                        <span className="num mt-0.5 block truncate font-mono text-[11px] text-ec-ink-3">
                          {[r.court, rCaseNo].filter(Boolean).join(" · ")}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </section>
          ))}
          {agenda.length === 0 && <p className="text-[13px] text-ec-ink-3">{t("agenda.empty")}</p>}
        </div>
      )}

      {/* Floating bulk-action bar — appears on selection (shared WO-43 primitive). WO-331: retoned
          to the reference's light card (see components/selection/bulk-bar.tsx); this select's own
          inline styling follows suit (it used to sit on a dark ink bar). */}
      <BulkBar count={sel.size} label={t("bulk.selected", { n: sel.size })} clearLabel={t("bulk.clear")} onClear={sel.clear}>
        <select
          onChange={(e) => { onSetStage(e.target.value); e.currentTarget.selectedIndex = 0; }}
          disabled={busy}
          defaultValue=""
          className={`${bulkBtn} bg-transparent pr-1`}
          aria-label={t("bulk.setStage")}
        >
          <option value="">{t("bulk.setStage")}</option>
          {stages.map((s) => <option key={s} value={s}>{cleanPurpose(s)}</option>)}
        </select>
        {/* WO-331 · kept visible per the prototype (bulk refresh is a designed control, not dropped) —
            the ACTION stays deferred to WO-309: a synchronous per-selected-case fan-out is exactly the
            live-fetch pattern that WO ruled out on measured BP-66 WAF evidence. */}
        <button type="button" disabled title={t("bulk.refreshTitle")} aria-disabled="true" className={`${bulkBtn} opacity-40`}>
          {t("bulk.refresh")}
        </button>
        <button onClick={onExport} disabled={busy} className={bulkBtn}>{t("bulk.export")}</button>
        <button onClick={onDelete} disabled={busy} className={`${bulkBtn} text-ec-danger`}>{t("bulk.delete")}</button>
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
