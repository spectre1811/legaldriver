"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/icons";
import { Combobox } from "@/components/combobox";
import { confirmEmail, confirmAllHighConfidence, archiveEmails, deleteEmails, restoreEmails } from "./actions";
import { useInboxSelection } from "./use-inbox-selection";
import { BulkBar, UndoToast, SelectBox } from "./bulk-ui";
import { Ticks } from "./ticks";
import { AttachmentPreview, type MailAttachment } from "./attachment-preview";

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
  attachments: MailAttachment[];
};
type Tab = "needs_review" | "filed" | "ignored";
type Sort = "date" | "sender";

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
function fullDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-IN", {
    timeZone: TZ, day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false,
  });
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
  account,
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
  account: string;
}) {
  const t = useTranslations("inbox");
  const td = useTranslations("dashboard.inbox");
  const tc = useTranslations("comms");
  const router = useRouter();

  // WO-335 · search + sort are pure client-side re-views of the already-fetched, tenant-scoped
  // page of emails (no new query/endpoint) — the Chambers reference's "Search these emails…" +
  // Date/Sender toggle, kept honest by only ever reordering/filtering rows already on screen.
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<Sort>("date");
  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    const filtered = term
      ? emails.filter((e) => (e.from + e.subject + (e.snippet ?? "") + (e.suggestion ?? "")).toLowerCase().includes(term))
      : emails;
    return sort === "sender" ? [...filtered].sort((a, b) => a.from.localeCompare(b.from)) : filtered;
  }, [emails, q, sort]);

  const order = shown.map((e) => e.id);
  const sel = useInboxSelection(order);
  const [pending, start] = useTransition();
  const [activeId, setActiveId] = useState<string>("");
  const active = shown.find((e) => e.id === activeId) ?? shown[0];
  const [mobileOpen, setMobileOpen] = useState(false);
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

  function openRow(id: string) {
    setActiveId(id);
    setMobileOpen(true);
  }

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

  // Keyboard: j/k move the selection, f files. Ignore while typing in the dock's comboboxes /
  // the search field / any other input.
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
        <nav aria-label={t("title")} className="flex flex-wrap items-center gap-1.5 border-b border-ec-line pb-3">
          {TABS.map((tb) => {
            const on = tb.key === tab;
            return (
              <Link
                key={tb.key}
                href={`?tab=${tb.key}`}
                scroll={false}
                aria-current={on ? "page" : undefined}
                className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12.5px] transition-colors ${
                  on ? "bg-ec-bronze-tint font-medium text-ec-bronze-deep" : "text-ec-muted-ink hover:bg-ec-paper-3"
                }`}
              >
                {tb.label}
                <span className="num font-mono text-[10.5px] text-ec-muted-ink">{tb.count}</span>
              </Link>
            );
          })}
        </nav>
        {tab === "needs_review" && (
          <button onClick={confirmAll} disabled={pending || confirmAllCount === 0} className="ec-btn ec-btn-ink text-[13px]">
            <Icon name="check" className="h-3.5 w-3.5" /> {t("confirmAll", { count: confirmAllCount })}
          </button>
        )}
      </div>

      {/* Below-threshold review banner (needs-review tab only) */}
      {tab === "needs_review" && belowThreshold > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-ec-warn/30 bg-ec-warn-bg px-4 py-3 text-sm text-ec-warn">
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
          <p className="font-display text-lg text-ec-ink">
            {tab === "needs_review" ? tc("emptyState.inbox") : t(tab === "filed" ? "emptyTab.filed" : "emptyTab.ignored")}
          </p>
        </div>
      ) : (
        <div className="ec-card grid overflow-hidden lg:grid-cols-[minmax(0,22rem)_1fr]">
          {/* LEFT — search/sort + list */}
          <div className="min-w-0 border-b border-ec-line lg:max-h-[44rem] lg:overflow-y-auto lg:border-b-0">
            <div className="flex flex-wrap items-center gap-2 border-b border-ec-line p-3">
              <div className="relative min-w-[160px] flex-1">
                <Icon name="search" className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ec-muted-ink" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder={td("searchPlaceholder")}
                  aria-label={td("searchAria")}
                  className="w-full rounded-md border border-ec-line bg-ec-card py-1.5 pl-7 pr-2 text-[12.5px] text-ec-ink outline-none placeholder:text-ec-muted-ink focus:border-ec-bronze"
                />
              </div>
              <div className="inline-flex items-center gap-[3px] rounded-md border border-ec-line bg-ec-paper-2 p-[3px]">
                {(["date", "sender"] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSort(s)}
                    aria-pressed={sort === s}
                    className={`rounded-[4px] px-2 py-1 text-[11.5px] font-medium transition-colors ${
                      sort === s ? "bg-ec-bronze-tint text-ec-bronze-deep" : "text-ec-ink-3 hover:bg-ec-paper-3"
                    }`}
                  >
                    {td(`sort.${s}`)}
                  </button>
                ))}
              </div>
            </div>

            <div className="px-3">
              <BulkBar count={sel.selected.size} busy={pending} onArchive={() => runBulk(archiveEmails)} onDelete={() => runBulk(deleteEmails)} onClear={sel.clear} />
            </div>

            <div className="flex items-center gap-2 px-4 py-2">
              <input
                type="checkbox"
                checked={shown.length > 0 && shown.every((r) => sel.selected.has(r.id))}
                onChange={() => (sel.selected.size === shown.length ? sel.clear() : sel.selectAll())}
                aria-label={t("bulk.selectAll")}
                className="h-3.5 w-3.5 accent-ec-bronze"
              />
              <span className="ec-label">{t("bulk.selectAll")}</span>
            </div>

            <ul className="divide-y divide-ec-line border-t border-ec-line">
              {shown.map((e) => {
                const isActive = active?.id === e.id;
                const isChecked = sel.selected.has(e.id);
                return (
                  <li
                    key={e.id}
                    className={`grid grid-cols-[auto_minmax(0,1fr)] gap-2.5 transition-colors ${
                      isActive ? "bg-ec-bronze-tint/40" : isChecked ? "bg-ec-paper-3/60" : "hover:bg-ec-bronze-tint/20"
                    }`}
                  >
                    <span className="ml-3 mt-4" onClick={(ev) => ev.stopPropagation()}>
                      <SelectBox checked={isChecked} onToggle={(shift) => sel.onRowToggle(e.id, shift)} />
                    </span>
                    <button type="button" onClick={() => openRow(e.id)} aria-current={isActive ? "true" : undefined} className="min-w-0 py-3 pr-3 text-left">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="num min-w-0 truncate font-mono text-[11.5px] text-ec-ink-2">{e.from || "—"}</span>
                        <span className="num shrink-0 font-mono text-[11px] text-ec-muted-ink">{inboxTime(e.receivedAt)}</span>
                      </div>
                      <div className="mt-0.5 truncate font-display text-[15px] text-ec-ink">{e.subject || t("noSubject")}</div>
                      {e.snippet && <p className="mt-0.5 truncate text-[12.5px] text-ec-muted-ink">{e.snippet}</p>}
                      <div className="mt-1.5 flex flex-wrap items-center gap-2">
                        {e.attachments.length > 0 && (
                          <span className="num inline-flex items-center gap-1 font-mono text-[10.5px] text-ec-muted-ink">
                            <Icon name="clip" className="h-2.5 w-2.5" /> {e.attachments.length}
                          </span>
                        )}
                        {tab === "needs_review" && <Ticks confidence={e.confidence} threshold={threshold} />}
                      </div>
                    </button>
                  </li>
                );
              })}
              {shown.length === 0 && (
                <li className="py-10 text-center text-[13px] text-ec-muted-ink">{td("noSearchResults", { q })}</li>
              )}
            </ul>
          </div>

          {/* RIGHT — preview + file dock (desktop split view) */}
          <div className="hidden min-h-[24rem] flex-col lg:flex">
            {!active ? (
              <div className="flex flex-1 items-center justify-center p-8 text-center text-[13px] text-ec-muted-ink">{t("preview.none")}</div>
            ) : (
              <MailDetail
                mail={active}
                tab={tab}
                account={account}
                threshold={threshold}
                clients={clients}
                matters={matters}
                dockClient={dockClient}
                dockMatter={dockMatter}
                setDockClient={setDockClient}
                setDockMatter={setDockMatter}
                pending={pending}
                onFile={fileActive}
                onSkip={advance}
                onArchive={archiveActive}
              />
            )}
          </div>
        </div>
      )}

      {/* mobile full-screen sheet — opens on tapping a row; the split view above stays desktop-only */}
      {mobileOpen && active && (
        <div className="fixed inset-0 z-[60] flex flex-col bg-ec-paper lg:hidden">
          <div className="flex items-center gap-2 border-b border-ec-line px-4 py-3">
            <button type="button" onClick={() => setMobileOpen(false)} className="inline-flex items-center gap-1.5 text-[13px] text-ec-ink-2">
              <Icon name="back" className="h-4 w-4" /> {t("title")}
            </button>
          </div>
          <div className="flex-1 overflow-auto p-4">
            <MailDetail
              mail={active}
              tab={tab}
              account={account}
              threshold={threshold}
              clients={clients}
              matters={matters}
              dockClient={dockClient}
              dockMatter={dockMatter}
              setDockClient={setDockClient}
              setDockMatter={setDockMatter}
              pending={pending}
              onFile={() => { fileActive(); setMobileOpen(false); }}
              onSkip={() => { advance(); setMobileOpen(false); }}
              onArchive={() => { archiveActive(); setMobileOpen(false); }}
            />
          </div>
        </div>
      )}

      {undo && <UndoToast label={undo.label} busy={pending} onUndo={doUndo} onDismiss={() => setUndo(null)} />}
    </div>
  );
}

/* ── detail pane ──────────────────────────────────────── */

function MailDetail({
  mail, tab, account, threshold, clients, matters,
  dockClient, dockMatter, setDockClient, setDockMatter,
  pending, onFile, onSkip, onArchive,
}: {
  mail: WorkspaceEmail;
  tab: Tab;
  account: string;
  threshold: number;
  clients: Opt[];
  matters: Opt[];
  dockClient: string;
  dockMatter: string;
  setDockClient: (v: string) => void;
  setDockMatter: (v: string) => void;
  pending: boolean;
  onFile: () => void;
  onSkip: () => void;
  onArchive: () => void;
}) {
  const t = useTranslations("inbox");
  const td = useTranslations("dashboard.inbox");
  const [openAttId, setOpenAttId] = useState<string | undefined>(mail.attachments[0]?.id);
  const openAtt = mail.attachments.find((a) => a.id === openAttId) ?? mail.attachments[0];

  useEffect(() => setOpenAttId(mail.attachments[0]?.id), [mail.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex flex-1 flex-col overflow-hidden lg:border-l lg:border-ec-line">
      <div className="border-b border-ec-line px-5 py-4">
        <h2 className="font-display text-[19px] leading-tight text-ec-ink">{mail.subject || t("noSubject")}</h2>
        <p className="num mt-1 truncate font-mono text-[11.5px] text-ec-ink-2">{mail.from || "—"}</p>
        <p className="num font-mono text-[11px] text-ec-muted-ink">{td("toLine", { account })} · {fullDate(mail.receivedAt)}</p>
      </div>

      <div className="flex-1 space-y-3 overflow-auto px-5 py-4">
        {mail.snippet ? (
          <p className="text-[13.5px] leading-relaxed text-ec-ink-2">{mail.snippet}</p>
        ) : (
          <p className="text-[13.5px] italic text-ec-muted-ink">{t("noSubject") === mail.subject ? "" : td("noPreview")}</p>
        )}
        {/* WO-335: `email_message` stores Gmail's short snippet only, never the full body (no
            schema change in this WO) — an honest caption instead of fabricating paragraphs the
            reference's dummy `body[]` implies. */}
        <p className="text-[11px] text-ec-muted-ink">{td("previewOnlyNote")}</p>

        {mail.attachments.length > 0 && (
          <div className="pt-2">
            <p className="ec-label">{td("attachments.heading", { n: mail.attachments.length })}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {mail.attachments.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setOpenAttId(a.id)}
                  className={`flex min-w-0 max-w-[240px] items-center gap-2 rounded-md border px-3 py-2 text-left transition-colors ${
                    openAtt?.id === a.id ? "border-ec-bronze bg-ec-bronze-tint/40" : "border-ec-line bg-ec-card hover:border-ec-bronze"
                  }`}
                >
                  <Icon name="documents" className="h-4 w-4 shrink-0 text-ec-bronze" />
                  <span className="min-w-0">
                    <span className="block truncate text-[12.5px] text-ec-ink">{a.filename}</span>
                    <span className="ec-mono-label block">{a.sizeLabel}</span>
                  </span>
                </button>
              ))}
            </div>
            {openAtt && (
              <div className="mt-3">
                <AttachmentPreview attachment={openAtt} />
              </div>
            )}
          </div>
        )}
      </div>

      {/* filing panel — only on the review tab; filing an already-filed/ignored email would
          resurrect it or overwrite its classification. */}
      {tab === "needs_review" && (
        <div className="space-y-3 border-t border-ec-line bg-ec-paper-3/40 px-5 py-4">
          <div className="flex items-center justify-between">
            <p className="ec-label">{t("dock.title")}</p>
            <div className="flex items-center gap-1 text-ec-muted-ink">
              <a href={`mailto:${mail.from}`} aria-label={t("preview.reply")} title={t("preview.reply")} className="rounded-md p-1.5 hover:bg-ec-paper-3 hover:text-ec-ink">
                <Icon name="external" className="h-4 w-4" />
              </a>
              <button onClick={onArchive} disabled={pending} aria-label={t("preview.archive")} title={t("preview.archive")} className="rounded-md p-1.5 hover:bg-ec-paper-3 hover:text-ec-ink disabled:opacity-50">
                <Icon name="inbox" className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="rounded-md border border-ec-line bg-ec-card p-3">
            <div className="flex items-center gap-1.5 text-[13.5px] text-ec-ink">
              <span className="text-ec-bronze">→</span> {mail.suggestion ?? t("preview.noCaseMatch")}
            </div>
            <div className="mt-1"><Ticks confidence={mail.confidence} threshold={threshold} /></div>
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
            <button onClick={onSkip} className="ec-btn ec-btn-ghost text-[12.5px]">{t("dock.skip")}</button>
            <button onClick={onFile} disabled={pending || (!dockClient && !dockMatter)} className="ec-btn ec-btn-ink text-[13px]">
              {pending ? t("dock.filing") : t("dock.file")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
