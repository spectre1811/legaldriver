"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/icons";
import { Combobox } from "@/components/combobox";
import { confidenceBand } from "@/lib/mail/inbox-status";
import { confirmEmail, confirmAllHighConfidence, archiveEmails, deleteEmails, restoreEmails } from "./actions";
import { useInboxSelection } from "./use-inbox-selection";
import { BulkBar, UndoToast, SelectBox } from "./bulk-ui";

type Opt = { id: string; label: string };
export type WorkspaceEmail = {
  id: string;
  subject: string;
  from: string;
  snippet: string | null;
  confidence: number | null;
  receivedAt: string | null;
  clientId: string | null;
  matterId: string | null;
  suggestion: string | null; // resolved case/client name, or null when the classifier had no match
  attachments: { id: string; filename: string }[];
};
type Tab = "needs_review" | "filed" | "ignored";

const BAND_CHIP = { high: "ec-chip-success", medium: "ec-chip-warn", low: "ec-chip-danger" } as const;

// mono clock for today's mail, "24 Jul" once it's older — matches the reference's mono time column.
// tz is pinned to IST (the audience) so the server (UTC) and browser render the same string — an
// unpinned toLocale* would produce a React hydration mismatch across timezones.
const TZ = "Asia/Kolkata";
function inboxTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const day = (x: Date) => x.toLocaleDateString("en-CA", { timeZone: TZ }); // YYYY-MM-DD in IST
  return day(d) === day(new Date())
    ? d.toLocaleTimeString("en-IN", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false })
    : d.toLocaleDateString("en-IN", { timeZone: TZ, day: "2-digit", month: "short" });
}

function ConfidencePill({ confidence, threshold }: { confidence: number | null; threshold: number }) {
  const t = useTranslations("inbox");
  const band = confidenceBand(confidence, threshold);
  const label = confidence != null ? t("confidence.value", { percent: Math.round(confidence * 100) }) : t("confidence.unrated");
  return (
    <span className={`ec-chip ${BAND_CHIP[band]}`} title={t("confidence.aria", { band })}>
      {label}
    </span>
  );
}

export function InboxWorkspace({
  emails,
  clients,
  matters,
  tab,
  counts,
  threshold,
  thresholdPct,
  belowThreshold,
  confirmAllCount,
}: {
  emails: WorkspaceEmail[];
  clients: Opt[];
  matters: Opt[];
  tab: Tab;
  counts: { needs_review: number; filed: number; ignored: number };
  threshold: number;
  thresholdPct: number;
  belowThreshold: number;
  confirmAllCount: number;
}) {
  const t = useTranslations("inbox");
  const tc = useTranslations("comms");
  const router = useRouter();
  const order = emails.map((e) => e.id);
  const sel = useInboxSelection(order);
  const [pending, start] = useTransition();
  const [activeId, setActiveId] = useState<string>("");
  const active = emails.find((e) => e.id === activeId) ?? emails[0];
  const [dockClient, setDockClient] = useState<string>("");
  const [dockMatter, setDockMatter] = useState<string>("");
  const [undo, setUndo] = useState<{ entries: { id: string; status: string }[]; label: string } | null>(null);

  // The dock is a view of the active email: reset its pickers to that email's stored suggestion
  // whenever the previewed email changes (tab switch, j/k, click, or advancing after a file).
  useEffect(() => {
    setDockClient(active?.clientId ?? "");
    setDockMatter(active?.matterId ?? "");
  }, [active?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Undo lives 8s (comms verb-system), then the toast retires.
  useEffect(() => {
    if (!undo) return;
    const id = setTimeout(() => setUndo(null), 8000);
    return () => clearTimeout(id);
  }, [undo]);

  const activeIndex = active ? order.indexOf(active.id) : -1;
  const advance = () => setActiveId(order[activeIndex + 1] ?? order[activeIndex - 1] ?? "");

  function fileActive() {
    if (pending || !active || (!dockClient && !dockMatter)) return;
    const target = matters.find((m) => m.id === dockMatter)?.label ?? clients.find((c) => c.id === dockClient)?.label ?? "";
    start(async () => {
      await confirmEmail(active.id, dockClient || null, dockMatter || null);
      setUndo({ entries: [{ id: active.id, status: "needs_review" }], label: t("dock.filed", { target }) });
      advance();
      router.refresh();
    });
  }
  function archiveActive() {
    if (!active) return;
    start(async () => {
      const r = await archiveEmails([active.id]);
      if (r.ok && r.undo?.length) setUndo({ entries: r.undo, label: r.message });
      advance();
      router.refresh();
    });
  }
  function confirmAll() {
    start(async () => {
      const r = await confirmAllHighConfidence();
      if (r.ok && r.undo?.length) setUndo({ entries: r.undo, label: r.message });
      router.refresh();
    });
  }
  // Bulk archive/delete (WO-29) routed through the one shared undo toast, not the hook's own.
  function runBulk(fn: (ids: string[]) => Promise<{ ok: boolean; message: string; undo?: { id: string; status: string }[] }>) {
    const ids = [...sel.selected];
    if (!ids.length) return;
    start(async () => {
      const r = await fn(ids);
      if (r.ok) {
        sel.clear();
        if (r.undo?.length) setUndo({ entries: r.undo, label: r.message });
        router.refresh();
      }
    });
  }
  async function doUndo() {
    if (!undo) return;
    await restoreEmails(undo.entries);
    setUndo(null);
    router.refresh();
  }

  // Keyboard: j/k move the selection, Enter opens (no-op — preview is always live), f files.
  // Ignore while typing in the dock's comboboxes / any field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return; // a held key must not fire a burst of files/moves
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      if (e.key === "j" || e.key === "ArrowDown") { e.preventDefault(); setActiveId(order[Math.min(activeIndex + 1, order.length - 1)] ?? activeId); }
      else if (e.key === "k" || e.key === "ArrowUp") { e.preventDefault(); setActiveId(order[Math.max(activeIndex - 1, 0)] ?? activeId); }
      else if (e.key === "f" && tab === "needs_review") { e.preventDefault(); fileActive(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }); // re-bind each render so it closes over the current active/dock state

  const TABS: { key: Tab; label: string; count: number }[] = [
    { key: "needs_review", label: t("tabs.needsReview"), count: counts.needs_review },
    { key: "filed", label: t("tabs.autoFiled"), count: counts.filed },
    { key: "ignored", label: t("tabs.ignored"), count: counts.ignored },
  ];

  return (
    <div className="space-y-4">
      {/* Toolbar: category pills + confirm-all */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label={t("title")} className="flex flex-wrap gap-1.5">
          {TABS.map((tb) => {
            const on = tb.key === tab;
            return (
              <Link
                key={tb.key}
                href={`?tab=${tb.key}`}
                scroll={false}
                aria-current={on ? "page" : undefined}
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition ${
                  on ? "bg-ink text-paper" : "text-ink-soft hover:bg-ec-band"
                }`}
              >
                {tb.label}
                <span className={`num text-xs ${on ? "text-paper/70" : "text-ink-faint"}`}>{tb.count}</span>
              </Link>
            );
          })}
        </nav>
        {tab === "needs_review" && (
          <button onClick={confirmAll} disabled={pending || confirmAllCount === 0} className="btn-primary text-sm">
            <Icon name="check" className="h-4 w-4" /> {t("confirmAll", { count: confirmAllCount })}
          </button>
        )}
      </div>

      {/* Below-threshold review banner (needs-review tab only) */}
      {tab === "needs_review" && belowThreshold > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-ec-warn/30 bg-ec-warn-t px-4 py-3 text-sm text-ec-warn">
          <span className="flex items-center gap-2">
            <Icon name="alert" className="h-4 w-4 shrink-0" />
            {t("banner.belowThreshold", { count: belowThreshold, threshold: thresholdPct })}
          </span>
          {confirmAllCount > 0 && (
            <button onClick={confirmAll} disabled={pending} className="shrink-0 font-medium underline underline-offset-2 hover:no-underline">
              {t("banner.selectAllFile")}
            </button>
          )}
        </div>
      )}

      <p aria-live="polite" className="sr-only">
        {TABS.find((tb) => tb.key === tab)?.count} {TABS.find((tb) => tb.key === tab)?.label}
      </p>

      {emails.length === 0 ? (
        <div className="ec-card flex flex-col items-center justify-center rounded-xl px-6 py-16 text-center">
          <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-ec-bronze-tint text-ec-bronze">
            <Icon name="inbox" className="h-5 w-5" />
          </span>
          <p className="font-display text-lg text-ink">
            {tab === "needs_review" ? tc("emptyState.inbox") : t(tab === "filed" ? "emptyTab.filed" : "emptyTab.ignored")}
          </p>
        </div>
      ) : (
        <div className="ec-card grid overflow-hidden rounded-xl lg:grid-cols-[minmax(0,22rem)_1fr]">
          {/* LEFT — list */}
          <ul className="divide-y divide-line lg:max-h-[38rem] lg:overflow-y-auto">
            {emails.map((e) => {
              const isActive = active?.id === e.id;
              const isChecked = sel.selected.has(e.id);
              return (
                <li
                  key={e.id}
                  className={`flex cursor-pointer items-start gap-2.5 px-3.5 py-3 transition ${
                    isActive ? "bg-ec-bronze-tint/50" : isChecked ? "bg-ec-band/60" : "hover:bg-ec-band/40"
                  }`}
                  onClick={() => setActiveId(e.id)}
                  aria-current={isActive ? "true" : undefined}
                >
                  <span className="pt-0.5" onClick={(ev) => ev.stopPropagation()}>
                    <SelectBox checked={isChecked} onToggle={(shift) => sel.onRowToggle(e.id, shift)} />
                  </span>
                  {tab === "needs_review" && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-ec-bronze" aria-label={t("tabs.needsReview")} />}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="min-w-0 truncate text-sm font-medium text-ink">{e.from || "—"}</span>
                      <span className="num shrink-0 text-xs text-ink-faint">{inboxTime(e.receivedAt)}</span>
                    </div>
                    <p className="truncate text-sm text-ink-soft">{e.subject || t("noSubject")}</p>
                    {e.snippet && <p className="truncate text-xs text-ink-faint">{e.snippet}</p>}
                    <div className="mt-1.5 flex items-center gap-2">
                      <ConfidencePill confidence={e.confidence} threshold={threshold} />
                      {e.attachments.length > 0 && (
                        <span className="inline-flex items-center gap-1 text-xs text-ink-faint">
                          <Icon name="clip" className="h-3 w-3" /> {e.attachments.length}
                        </span>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>

          {/* RIGHT — preview + file dock */}
          <div className="flex min-h-[24rem] flex-col border-t border-line lg:border-l lg:border-t-0">
            {!active ? (
              <div className="flex flex-1 items-center justify-center p-8 text-sm text-ink-faint">{t("preview.none")}</div>
            ) : (
              <>
                <div className="flex-1 space-y-4 p-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <ConfidencePill confidence={active.confidence} threshold={threshold} />
                    <span className="ec-chip ec-chip-hot">
                      {t("preview.suggests")} · {active.suggestion ?? t("preview.noCaseMatch")}
                    </span>
                    <span className="num ml-auto text-xs text-ink-faint">{inboxTime(active.receivedAt)}</span>
                  </div>
                  <h2 className="font-display text-xl leading-snug text-ink">{active.subject || t("noSubject")}</h2>
                  <p className="text-sm text-ink-soft">{active.from}</p>
                  {active.snippet && <p className="whitespace-pre-line text-sm leading-relaxed text-ink-soft">{active.snippet}</p>}
                  {active.attachments.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="ec-label">{t("preview.attachments")}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {active.attachments.map((a) => (
                          <Link
                            key={a.id}
                            href={`/dashboard/documents/${a.id}`}
                            className="inline-flex max-w-[16rem] items-center gap-1 truncate rounded-md bg-paper px-2 py-1 text-xs text-ec-bronze hover:bg-ec-bronze-tint"
                          >
                            <Icon name="clip" className="h-3 w-3 shrink-0" /> <span className="truncate">{a.filename}</span>
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* File-this-email dock (recessed band) — only on the review tab; filing an
                    already-filed/ignored email would resurrect it or overwrite its classification. */}
                {tab === "needs_review" && (
                  <div className="space-y-3 border-t border-line bg-paper-3 p-4">
                    <div className="flex items-center justify-between">
                      <p className="ec-label">{t("dock.title")}</p>
                      <div className="flex items-center gap-1 text-ink-faint">
                        <a href={`mailto:${active.from}`} aria-label={t("preview.reply")} className="rounded-md p-1.5 hover:bg-ec-band hover:text-ink">
                          <Icon name="external" className="h-4 w-4" />
                        </a>
                        <button onClick={archiveActive} disabled={pending} aria-label={t("preview.archive")} className="rounded-md p-1.5 hover:bg-ec-band hover:text-ink disabled:opacity-50">
                          <Icon name="inbox" className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <Combobox
                        label={t("dock.client")} placeholder={t("dock.clientPlaceholder")}
                        options={clients.map((c) => ({ value: c.id, label: c.label }))}
                        value={dockClient || null} onChange={(v) => setDockClient(v ?? "")}
                      />
                      <Combobox
                        label={t("dock.case")} placeholder={t("dock.casePlaceholder")}
                        options={matters.map((m) => ({ value: m.id, label: m.label }))}
                        value={dockMatter || null} onChange={(v) => setDockMatter(v ?? "")}
                      />
                    </div>
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={advance} className="btn-ghost text-sm">{t("dock.skip")}</button>
                      <button onClick={fileActive} disabled={pending || (!dockClient && !dockMatter)} className="btn-primary text-sm">
                        {pending ? t("dock.filing") : t("dock.file")}
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      <BulkBar count={sel.selected.size} busy={pending} onArchive={() => runBulk(archiveEmails)} onDelete={() => runBulk(deleteEmails)} onClear={sel.clear} />
      {undo && <UndoToast label={undo.label} busy={pending} onUndo={doUndo} onDismiss={() => setUndo(null)} />}
    </div>
  );
}
