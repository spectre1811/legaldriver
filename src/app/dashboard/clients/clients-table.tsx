"use client";

// WO-408 E3 — the clients roster's selection + bulk/inline delete. Extracted out of page.tsx (a
// server component) because selection state, the ConfirmAction dialog, and the Undo toast all need
// client-side hooks; page.tsx still owns the fetch + masthead + search + pagination, and just hands
// this component the already-loaded page of rows.
//
// Word-wrap fix (founder-flagged bug): the client-name cell no longer truncates to one line —
// `whitespace-normal break-words` lets long names wrap onto a second line instead of clipping.
//
// Reuses three existing shared primitives, none forked: `useSelection`/`BulkBar`/`RowCheckbox`/
// `SelectAllCheckbox` (WO-43), `ConfirmAction` (WO-405 — its first real consumer), `useToast`
// (WO-405). The cascade guard (`partitionByLinkedMatters`, cascade.ts) is computed here off the
// SAME per-row `caseCount` the roster already shows in its "Matters" column (a real, server-computed
// count — not decorative) so the dialog opens instantly with no extra round trip; the actual delete
// (clients/actions.ts `deleteClients`) re-verifies the guard itself and never trusts this partition.
import { Fragment, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/icons";
import { fmtMoney, fmtAgo } from "@/components/ui";
import { useSelection } from "@/components/selection/use-selection";
import { BulkBar, bulkBtn, RowCheckbox, SelectAllCheckbox } from "@/components/selection/bulk-bar";
import { ConfirmAction } from "@/components/confirm-action";
import { confirmButtonClasses } from "@/components/confirm-action/logic";
import { useToast } from "@/components/toast";
import { partitionByLinkedMatters } from "./cascade";
import { deleteClients, undoDeleteClients } from "./actions";
import type { ClientRow } from "./clients-query";

// Total <td>/<th> columns in the row, for the inline-confirm bar's colSpan (checkbox, client,
// contact, matters, last activity, outstanding, row-delete).
const COLUMN_COUNT = 7;

export function ClientsTable({ clients, q }: { clients: ClientRow[]; q: string }) {
  const t = useTranslations("clients");
  const td = useTranslations("dashboard.clients");
  const tb = useTranslations("clients.bulk");
  const tc = useTranslations("common.actions");
  const router = useRouter();
  const toast = useToast();

  const orderedIds = clients.map((c) => c.id);
  const sel = useSelection(orderedIds);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [rowBusy, setRowBusy] = useState(false);
  const [rowBlockedMsg, setRowBlockedMsg] = useState<string | null>(null);

  // The same signal the "Matters" column already shows — a client with any linked matter is
  // blocked. See cascade.ts for why this one function serves both this preview and the server's
  // real, re-verified guard.
  const linkedIds = new Set(clients.filter((c) => c.caseCount > 0).map((c) => c.id));
  const selectedRows = clients.filter((c) => sel.isSelected(c.id));
  const { deletable, blocked } = partitionByLinkedMatters(selectedRows, linkedIds);

  function undoAction(ids: string[]) {
    return {
      label: tb("undo"),
      onClick: () => {
        undoDeleteClients(ids).then(() => router.refresh());
      },
    };
  }

  async function handleBulkConfirm() {
    setBusy(true);
    try {
      const r = await deleteClients(deletable.map((c) => c.id));
      setConfirmOpen(false);
      sel.clear();
      if (r.deletedIds.length) {
        toast({ title: tb("deletedToast", { n: r.deletedIds.length }), action: undoAction(r.deletedIds) });
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function handleRowDelete(row: ClientRow) {
    setRowBusy(true);
    setRowBlockedMsg(null);
    try {
      const r = await deleteClients([row.id]);
      if (r.deletedIds.length) {
        setExpandedRow(null);
        toast({ title: tb("deletedToast", { n: 1 }), action: undoAction(r.deletedIds) });
        router.refresh();
      } else {
        // Real guard refused it (server-verified) — honest inline message, not a silent no-op.
        setRowBlockedMsg(tb("inlineBlocked", { n: row.caseCount }));
      }
    } finally {
      setRowBusy(false);
    }
  }

  return (
    <>
      <div className="ec-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ec-hair text-left">
                <th className="w-9 px-3 py-3">
                  <SelectAllCheckbox
                    checked={orderedIds.length > 0 && sel.allSelected(orderedIds)}
                    onToggle={() => sel.toggleGroup(orderedIds)}
                    label={tb("selectAll")}
                  />
                </th>
                <th className="ec-label px-5 py-3">{t("colClient")}</th>
                <th className="ec-label hidden px-5 py-3 md:table-cell">{t("colContact")}</th>
                <th className="ec-label px-5 py-3">{td("colMatters")}</th>
                <th className="ec-label hidden px-5 py-3 lg:table-cell">{td("lastActivity")}</th>
                <th className="ec-label px-5 py-3">{t("colOutstanding")}</th>
                <th className="w-9 px-2 py-3">
                  <span className="sr-only">{tb("deleteRow")}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {clients.map((c) => {
                // Real analogue of the reference's dummy `city` line — the schema has no separate
                // city field, so the client's own filed address fills the same slot.
                const address = (c.custom as { address?: string } | null)?.address ?? null;
                const checked = sel.isSelected(c.id);
                const expanded = expandedRow === c.id;
                return (
                  <Fragment key={c.id}>
                    <tr
                      className={`ec-row group border-b border-ec-hair last:border-0 ${checked ? "bg-ec-bronze-tint" : ""}`}
                    >
                      <td className="px-3 py-3.5">
                        <RowCheckbox checked={checked} onSelect={(shift) => sel.onRowClick(c.id, shift)} label={tb("selectRow", { name: c.name })} />
                      </td>
                      <td className="px-5 py-3.5">
                        <Link href={`/dashboard/clients/${c.id}`} className="flex min-w-0 items-start gap-2.5">
                          <Icon name={c.type === "org" ? "building" : "person"} className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ec-ink-3" />
                          {/* Word-wrap fix (founder-flagged): drop the truncate so a long name wraps
                              to a second line instead of clipping. */}
                          <span className="min-w-0 max-w-[280px]">
                            <span className="font-display block whitespace-normal break-words text-[15px] font-medium leading-snug text-ec-ink transition-colors group-hover:text-ec-bronze">
                              {c.name}
                            </span>
                            <span className="block truncate text-[11.5px] text-ec-muted-ink">{address ?? "—"}</span>
                          </span>
                        </Link>
                      </td>
                      <td className="hidden px-5 py-3.5 md:table-cell">
                        <div className="num min-w-0 font-mono text-[11.5px] text-ec-ink-2">
                          <div className="truncate">{c.phones?.[0] ?? "—"}</div>
                          {c.emails?.[0] && <div className="truncate text-ec-muted-ink">{c.emails[0]}</div>}
                        </div>
                      </td>
                      <td className="num px-5 py-3.5 text-ec-ink-2">{c.caseCount}</td>
                      <td className="hidden px-5 py-3.5 text-ec-ink-3 lg:table-cell">
                        {c.lastActivity ? (
                          <span title={c.lastActivity.summary} className="block max-w-[220px] truncate">
                            {c.lastActivity.summary} · <span className="num">{fmtAgo(c.lastActivity.at)}</span>
                          </span>
                        ) : (
                          <span className="text-ec-ink-3">{td("noActivity")}</span>
                        )}
                      </td>
                      <td className="num px-5 py-3.5">
                        {c.outstandingMinor > 0 ? (
                          <span className="text-ec-ink">{fmtMoney(c.outstandingMinor)}</span>
                        ) : (
                          <span className="text-ec-ink-3">{td("settled")}</span>
                        )}
                      </td>
                      <td className="px-2 py-3.5 text-right">
                        <button
                          type="button"
                          onClick={() => {
                            setRowBlockedMsg(null);
                            setExpandedRow(expanded ? null : c.id);
                          }}
                          aria-label={tb("deleteRowAria", { name: c.name })}
                          className={`rounded-full p-1.5 text-ec-muted-ink transition hover:bg-ec-band hover:text-ec-danger focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ec-bronze group-hover:opacity-100 ${expanded ? "opacity-100 text-ec-danger" : "opacity-0"}`}
                        >
                          <Icon name="trash" className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                    {expanded && (
                      <tr className="border-b border-ec-hair last:border-0">
                        <td colSpan={COLUMN_COUNT} className="border-t border-ec-line bg-ec-band px-4 py-2.5">
                          {rowBlockedMsg ? (
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <span className="text-[12.5px] font-medium text-ec-warn">{rowBlockedMsg}</span>
                              <button
                                type="button"
                                onClick={() => setExpandedRow(null)}
                                className="rounded-ec-s border border-ec-line px-3 py-1.5 text-[12.5px] text-ec-ink-2 transition hover:bg-ec-paper-3"
                              >
                                {tc("cancel")}
                              </button>
                            </div>
                          ) : (
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <span className="text-[12.5px] text-ec-ink-2">{tb("inlineConfirm", { name: c.name })}</span>
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  disabled={rowBusy}
                                  onClick={() => setExpandedRow(null)}
                                  className="rounded-ec-s border border-ec-line px-3 py-1.5 text-[12.5px] text-ec-ink-2 transition hover:bg-ec-paper-3 disabled:opacity-50"
                                >
                                  {tc("cancel")}
                                </button>
                                <button
                                  type="button"
                                  disabled={rowBusy}
                                  onClick={() => handleRowDelete(c)}
                                  className={confirmButtonClasses("danger")}
                                >
                                  {rowBusy ? "…" : tb("deleteRow")}
                                </button>
                              </div>
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        {clients.length === 0 && <p className="px-5 py-10 text-center text-sm text-ec-ink-3">{td("noMatches", { q })}</p>}
      </div>

      <BulkBar count={sel.size} label={tb("selected", { n: sel.size })} clearLabel={tb("clear")} onClear={sel.clear}>
        <button type="button" onClick={() => setConfirmOpen(true)} disabled={busy} className={`${bulkBtn} text-ec-danger`}>
          {tb("deleteSelected")}
        </button>
      </BulkBar>

      <ConfirmAction
        open={confirmOpen}
        title={tb("confirmTitle", { n: sel.size })}
        body={tb("deletableLine", { n: deletable.length })}
        cascade={blocked.length ? { heading: tb("blockedHeading", { k: blocked.length }), items: blocked.map((c) => ({ id: c.id, label: c.name })) } : undefined}
        confirmLabel={tb("confirmDelete", { n: deletable.length })}
        confirmDisabled={deletable.length === 0}
        variant="danger"
        busy={busy}
        onConfirm={handleBulkConfirm}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  );
}
