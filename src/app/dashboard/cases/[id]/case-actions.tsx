"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/icons";
import { generateCaseSummary, addCaseDocument, updateCase, refreshCase, confirmDeadline, dismissDeadline, setDiaryDate } from "../actions";

// The advocate's own next-hearing "diary" date — overrides a stale/wrong court date.
export function MatterDiaryDate({ matterId, synced, override }: { matterId: string; synced: string | null; override: string | null }) {
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  const t = useTranslations("caseDetail");
  if (!editing) {
    return (
      <button onClick={() => setEditing(true)} className="inline-flex items-center gap-1.5 text-xs text-brand-600 hover:underline">
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
        disabled={pending} className="rounded-lg bg-brand-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-brand-700"
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
      <button onClick={() => start(async () => { await confirmDeadline(deadlineId); router.refresh(); })} disabled={pending} className="rounded-lg bg-brand-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50">
        {t("actions.confirm")}
      </button>
      <button onClick={() => start(async () => { await dismissDeadline(deadlineId); router.refresh(); })} disabled={pending} className="rounded-lg border border-line px-2.5 py-1 text-xs text-ink-muted hover:text-red-600 disabled:opacity-50">
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
        onClick={() => start(async () => { setMsg(null); const r = await refreshCase(matterId); setMsg({ ok: r.ok, text: r.message }); router.refresh(); })}
        disabled={pending}
        className="btn-secondary"
      >
        <Icon name="refresh" className={`h-4 w-4 ${pending ? "animate-spin" : ""}`} /> {pending ? t("actions.refreshing") : t("actions.refresh")}
      </button>
      {msg && <span role="status" className={`max-w-xs text-xs ${msg.ok ? "text-ink-muted" : "text-red-600"}`}>{msg.text}</span>}
    </div>
  );
}

export function GenerateSummaryButton({ matterId, has }: { matterId: string; has: boolean }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState("");
  const router = useRouter();
  const t = useTranslations("caseDetail");
  return (
    <div className="flex items-center gap-3">
      <button
        onClick={() => start(async () => { const r = await generateCaseSummary(matterId); setMsg(r.message); router.refresh(); })}
        disabled={pending}
        className="btn-primary"
      >
        <Icon name="sparkles" className="h-4 w-4" /> {pending ? t("actions.analysing") : has ? t("actions.regenerate") : t("actions.generateSummary")}
      </button>
      {msg && <span className="max-w-xs text-xs text-ink-muted">{msg}</span>}
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
      <input type="file" name="file" required className="block max-w-xs text-sm text-ink-soft file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-brand-700 hover:file:bg-brand-100" />
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
      <button onClick={() => setOpen(true)} className="btn-secondary">
        <Icon name="settings" className="h-4 w-4" /> {t("actions.edit")}
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
