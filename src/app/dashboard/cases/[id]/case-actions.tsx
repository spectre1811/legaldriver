"use client";

import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/icons";
import { ConfirmDelete } from "@/components/confirm-delete";
import { LogTimeExpense } from "./time-expense";
import { SectionLabel } from "./case-section";
import { ShareCaseButton, ExportPdfButton } from "./share-export";
import { generateCaseSummary, addCaseDocument, updateCase, refreshCase, confirmDeadline, dismissDeadline, setDiaryDate, deleteMatter } from "../actions";

// WO-332 · founder ask: the AI briefing card is long and dense — make it hideable, and remember the
// choice. A plain useState toggle (not CaseRecord's native <details>) because this ONE needs to
// persist across visits — localStorage, client-only, not worth a DB round-trip for a UI preference.
// Renders expanded on the server (matches the pre-existing default); a mount-time effect applies
// whatever was last chosen — the one-frame "flash" of expanded-then-maybe-collapsed is the standard
// tradeoff for any localStorage-backed UI state that must also SSR something.
const AI_BRIEFING_COLLAPSED_KEY = "ld.aiBriefing.collapsed";

export function AiBriefingSection({
  title,
  generateSummary,
  hideLabel,
  showLabel,
  children,
}: {
  title: string;
  generateSummary: ReactNode;
  hideLabel: string;
  showLabel: string;
  children: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (window.localStorage.getItem(AI_BRIEFING_COLLAPSED_KEY) === "1") setCollapsed(true);
  }, []);

  const toggle = () => {
    setCollapsed((c) => {
      const next = !c;
      window.localStorage.setItem(AI_BRIEFING_COLLAPSED_KEY, next ? "1" : "0");
      return next;
    });
  };

  return (
    <>
      <SectionLabel
        right={
          <div className="flex items-center gap-3">
            {generateSummary}
            <button
              type="button"
              onClick={toggle}
              aria-expanded={!collapsed}
              className="inline-flex items-center gap-1 text-[12px] font-medium text-ec-bronze-deep hover:underline"
            >
              {collapsed ? showLabel : hideLabel}
              <Icon name="chevron" className={`h-3 w-3 rotate-90 transition-transform ${collapsed ? "" : "-rotate-90"}`} />
            </button>
          </div>
        }
      >
        {title}
      </SectionLabel>
      {!collapsed && <div className="ec-card p-5">{children}</div>}
    </>
  );
}

// The advocate's own next-hearing "diary" date — overrides a stale/wrong court date.
export function MatterDiaryDate({ matterId, synced, override }: { matterId: string; synced: string | null; override: string | null }) {
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  const t = useTranslations("caseDetail");
  if (!editing) {
    return (
      <button onClick={() => setEditing(true)} className="inline-flex items-center gap-1.5 text-xs text-ec-bronze-deep hover:underline">
        <Icon name="calendar" className="h-3.5 w-3.5" />
        {override ? t("actions.diaryDateOverride", { date: override, synced: synced ?? "—" }) : t("actions.setDiaryDate")}
      </button>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <input type="date" defaultValue={override ?? synced ?? ""} id={`diary-${matterId}`} className="rounded-lg border border-line px-2 py-1 text-xs" />
      <button
        onClick={() => start(async () => {
          const v = (document.getElementById(`diary-${matterId}`) as HTMLInputElement)?.value ?? "";
          await setDiaryDate(matterId, v); setEditing(false); router.refresh();
        })}
        disabled={pending} className="rounded-lg bg-ec-ink px-2.5 py-1 text-xs font-medium text-ec-paper transition-opacity hover:opacity-90 disabled:opacity-50"
      >{t("actions.save")}</button>
      {override && <button onClick={() => start(async () => { await setDiaryDate(matterId, ""); setEditing(false); router.refresh(); })} className="text-xs text-ink-faint hover:text-red-600">{t("actions.clear")}</button>}
      <button onClick={() => setEditing(false)} className="text-xs text-ink-faint">{t("actions.cancel")}</button>
    </div>
  );
}

// Confirm / dismiss a single proposed deadline (Phase D — propose-for-confirmation).
export function ProposedDeadlineActions({ deadlineId }: { deadlineId: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const t = useTranslations("caseDetail");
  return (
    <span className="flex items-center gap-2">
      <button onClick={() => start(async () => { await confirmDeadline(deadlineId); router.refresh(); })} disabled={pending} className="rounded-lg bg-ec-ink px-2.5 py-1 text-xs font-medium text-ec-paper transition-opacity hover:opacity-90 disabled:opacity-50">
        {t("actions.confirm")}
      </button>
      <button onClick={() => start(async () => { await dismissDeadline(deadlineId); router.refresh(); })} disabled={pending} className="rounded-lg border border-line px-2.5 py-1 text-xs text-ink-muted transition-colors hover:bg-ec-paper-3 hover:text-ec-ink-2 disabled:opacity-50">
        {t("actions.dismiss")}
      </button>
    </span>
  );
}

export function RefreshButton({ matterId }: { matterId: string }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const router = useRouter();
  const t = useTranslations("caseDetail");
  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => start(async () => {
          // WO-156: catch a rejected server action (transport/runtime error) so the button
          // shows an error instead of silently doing nothing — an unhandled rejection inside a
          // useTransition callback is swallowed, which is exactly what read as "refresh is broken".
          setMsg(null);
          try {
            const r = await refreshCase(matterId);
            setMsg({ ok: r.ok, text: r.message });
            router.refresh();
          } catch {
            setMsg({ ok: false, text: t("actions.refreshFailed") });
          }
        })}
        disabled={pending}
        className="inline-flex items-center gap-1.5 rounded-md border border-ec-ink-border px-3 py-1.5 text-[12.5px] text-paper transition-colors hover:border-ec-honey hover:text-ec-honey disabled:opacity-50"
      >
        <Icon name="refresh" className={`h-3.5 w-3.5 ${pending ? "animate-spin" : ""}`} /> {pending ? t("actions.refreshing") : t("actions.refresh")}
      </button>
      {msg && <span role="status" className={`max-w-xs text-xs ${msg.ok ? "text-ec-line-strong" : "text-red-400"}`}>{msg.text}</span>}
    </div>
  );
}

// WO-332 · copy the CNR to clipboard — the prototype's header affordance. Falls back silently
// (no clipboard permission in some embedded contexts) rather than throwing.
export function CopyCnrButton({ cnr, label, copiedLabel }: { cnr: string; label: string; copiedLabel: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try { await navigator.clipboard?.writeText(cnr); } catch { /* no clipboard permission — nothing to file, the chip still shows the CNR */ }
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1400);
      }}
      aria-label={label}
      className="inline-flex items-center gap-1 rounded border border-ec-ink-border px-1.5 py-0.5 text-[10.5px] text-ec-line-strong transition-colors hover:border-ec-honey hover:text-ec-honey"
    >
      <Icon name={copied ? "check" : "copy"} className="h-2.5 w-2.5" />
      {copied ? copiedLabel : label}
    </button>
  );
}

// WO-332 · the header's "More actions" menu. "Delete" (existing soft-delete via ConfirmDelete/
// deleteMatter) is joined by two real WO-411 actions — Share and Export — both wired to a live
// backend now (see share-export.tsx). Only "Add to calendar" has no backing route in this app yet
// — shown disabled with a "Soon" mark rather than silently dropped or wired to a no-op, matching
// the WO-331 precedent for an un-shippable-yet reference control.
export function CaseMenu({
  matterId, label, deleteLabel, deleteConfirmLabel, deleteNote, calendarSoonLabel, soonLabel,
}: {
  matterId: string; label: string; deleteLabel: string; deleteConfirmLabel: string; deleteNote: string;
  calendarSoonLabel: string; soonLabel: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        aria-label={label}
        onClick={() => setOpen((v) => !v)}
        className="grid h-[31px] w-[31px] place-items-center rounded-md border border-ec-ink-border text-paper transition-colors hover:border-ec-honey hover:text-ec-honey"
      >
        <Icon name="more" className="h-4 w-4" />
      </button>
      {/* Always mounted once opened once (not `{open && ...}`) — ShareCaseButton/ExportPdfButton
          own a portal <Dialog>/toast that must outlive THIS small dropdown closing (onDone closes
          it the instant either action is clicked, in the same render as the dialog opening; an
          unmount here would tear the dialog down with it). Only visibility toggles with `open`;
          the portaled content renders elsewhere in the DOM and is unaffected by it. */}
      <div className={`absolute right-0 z-40 mt-1.5 w-56 rounded-[10px] border border-ec-line bg-ec-card p-1.5 shadow-ec-2 ${open ? "block motion-safe:animate-fade-in" : "hidden"}`}>
        <ShareCaseButton matterId={matterId} onDone={() => setOpen(false)} />
        <ExportPdfButton matterId={matterId} onDone={() => setOpen(false)} />
        <div className="flex items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px] text-ec-ink-3">
          <span>{calendarSoonLabel}</span>
          <span className="ec-chip shrink-0 !text-[9px]">{soonLabel}</span>
        </div>
        <div className="mt-1 border-t border-ec-line pt-1">
          <ConfirmDelete action={deleteMatter} id={matterId} label={deleteLabel} confirmLabel={deleteConfirmLabel} note={deleteNote} redirectTo="/dashboard/cases" size="md" />
        </div>
      </div>
    </div>
  );
}

// WO-332 · billing rail — a compact summary + "Log time" reveal (the reference keeps the ledger
// entry form out of sight until asked for). The full time/expense ledger + invoices stay in the
// main-column Billing section unchanged; this only toggles the existing LogTimeExpense form.
export function LogTimeToggle({ matterId, label }: { matterId: string; label: string }) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-ec-line px-3 py-1.5 text-[12.5px] text-ec-ink-2 transition-colors hover:border-ec-line-strong hover:bg-ec-band"
      >
        <Icon name="clock" className="h-3.5 w-3.5" /> {label}
      </button>
    );
  }
  return (
    <div className="-mx-4 -mb-4 mt-3 border-t border-ec-hair">
      <LogTimeExpense matterId={matterId} />
    </div>
  );
}

export function GenerateSummaryButton({ matterId, has }: { matterId: string; has: boolean }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState("");
  const router = useRouter();
  const t = useTranslations("caseDetail");
  // Slim text link once a briefing exists (matches the reference's SectionLabel "Regenerate"
  // affordance); a real filled CTA the first time, since there's nothing on the card to click yet.
  const className = has
    ? "inline-flex items-center gap-1.5 text-[12px] text-ec-bronze-deep hover:underline disabled:opacity-50"
    : "ec-btn ec-btn-ink !px-3 !py-1.5 text-[12.5px] disabled:opacity-50";
  return (
    <div className="flex items-center gap-3">
      <button
        onClick={() => start(async () => { const r = await generateCaseSummary(matterId); setMsg(r.message); router.refresh(); })}
        disabled={pending}
        className={className}
      >
        <Icon name={has ? "refresh" : "sparkles"} className="h-3.5 w-3.5" /> {pending ? t("actions.analysing") : has ? t("actions.regenerate") : t("actions.generateSummary")}
      </button>
      {msg && <span className="max-w-xs text-xs text-ec-ink-3">{msg}</span>}
    </div>
  );
}

export function AddDocumentForm({ matterId }: { matterId: string }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();
  const t = useTranslations("caseDetail");
  return (
    <form
      ref={formRef}
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        start(async () => {
          const r = await addCaseDocument(matterId, fd);
          setMsg(r.message);
          if (r.ok) { formRef.current?.reset(); router.refresh(); }
        });
      }}
      className="flex flex-wrap items-center gap-3"
    >
      <input type="file" name="file" required className="block max-w-xs text-sm text-ink-soft file:mr-3 file:rounded-lg file:border-0 file:bg-ec-bronze-tint file:px-3 file:py-2 file:text-sm file:font-medium file:text-ec-bronze-deep hover:file:bg-ec-paper-3" />
      <button type="submit" disabled={pending} className="btn-secondary">
        <Icon name="upload" className="h-4 w-4" /> {pending ? t("actions.uploading") : t("actions.upload")}
      </button>
      {msg && <span className="text-xs text-ink-muted">{msg}</span>}
    </form>
  );
}

export function EditCaseForm({
  matterId,
  initial,
}: {
  matterId: string;
  initial: { title: string; court: string; case_type: string; stage: string; status: string; next_hearing_date: string };
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  const t = useTranslations("caseDetail");
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-md border border-ec-ink-border px-3 py-1.5 text-[12.5px] text-paper transition-colors hover:border-ec-honey hover:text-ec-honey"
      >
        <Icon name="edit" className="h-3.5 w-3.5" /> {t("actions.edit")}
      </button>
    );
  }
  const field = (name: keyof typeof initial, label: string, type = "text") => (
    <div>
      <label className="label" htmlFor={name}>{label}</label>
      <input id={name} name={name} type={type} defaultValue={initial[name]} className="input mt-1.5" />
    </div>
  );
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        start(async () => { await updateCase(matterId, fd); setOpen(false); router.refresh(); });
      }}
      className="card w-full space-y-4 p-5"
    >
      <h3 className="text-base font-medium">{t("actions.editCaseTitle")}</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        {field("title", t("actions.fieldTitle"))}
        {field("court", t("actions.fieldCourt"))}
        {field("case_type", t("actions.fieldCaseType"))}
        {field("stage", t("actions.fieldStage"))}
        {field("status", t("actions.fieldStatus"))}
        {field("next_hearing_date", t("actions.fieldNextHearing"), "date")}
      </div>
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className="btn-primary">{pending ? t("actions.saving") : t("actions.save")}</button>
        <button type="button" onClick={() => setOpen(false)} className="btn-ghost">{t("actions.cancel")}</button>
      </div>
    </form>
  );
}
