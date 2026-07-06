"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/icons";
import { Combobox } from "@/components/combobox";
import { confirmEmail, deleteEmails, archiveEmails } from "./actions";
import { useInboxSelection } from "./use-inbox-selection";
import { BulkBar, UndoToast, SelectBox } from "./bulk-ui";

type Opt = { id: string; label: string };
export type ReviewEmail = { id: string; subject: string; from: string; confidence: number | null; client_id: string | null; matter_id: string | null };

// A single needs-review row: the per-item file controls (unchanged behaviour) + a selection box.
function ReviewRow({ email, clients, matters, checked, onToggle }: {
  email: ReviewEmail; clients: Opt[]; matters: Opt[]; checked: boolean; onToggle: (shift: boolean) => void;
}) {
  const t = useTranslations("inbox");
  const [clientId, setClientId] = useState(email.client_id ?? "");
  const [matterId, setMatterId] = useState(email.matter_id ?? "");
  const [pending, start] = useTransition();
  const router = useRouter();

  return (
    <li className={`flex items-start gap-3 px-5 py-3.5 ${checked ? "bg-brand-50" : ""}`}>
      <SelectBox checked={checked} onToggle={onToggle} />
      <div className="min-w-0 flex-1 space-y-2.5">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-ink">{email.subject || t("review.noSubject")}</p>
            <p className="truncate text-xs text-ink-faint">{email.from}</p>
          </div>
          <span className="shrink-0 text-xs text-amber-700">
            {email.confidence != null ? t("review.confidence", { percent: Math.round(email.confidence * 100) }) : t("review.confidenceLow")}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Combobox
            label={t("review.assignClient")} placeholder={t("review.clientOption")}
            options={clients.map((c) => ({ value: c.id, label: c.label }))}
            value={clientId || null} onChange={(v) => setClientId(v ?? "")}
            className="min-w-[10rem] max-w-[12rem]"
          />
          <Combobox
            label={t("review.assignCase")} placeholder={t("review.caseOption")}
            options={matters.map((m) => ({ value: m.id, label: m.label }))}
            value={matterId || null} onChange={(v) => setMatterId(v ?? "")}
            className="min-w-[10rem] max-w-[12rem]"
          />
          <button
            onClick={() => start(async () => { await confirmEmail(email.id, clientId || null, matterId || null); router.refresh(); })}
            disabled={pending || (!clientId && !matterId)}
            className="btn-primary px-3 py-1.5 text-xs"
          >
            {pending ? t("review.filing") : t("review.confirmAndFile")}
          </button>
        </div>
      </div>
    </li>
  );
}

// WO-29 · needs-review list with selection + bulk archive/delete + undo — so junk that slipped
// into review (before the spam filter) can be cleared in one action, not one-by-one.
export function ReviewInbox({ emails, clients, matters }: { emails: ReviewEmail[]; clients: Opt[]; matters: Opt[] }) {
  const t = useTranslations("inbox");
  const sel = useInboxSelection(emails.map((e) => e.id));

  return (
    <div className="space-y-3">
      <div className="ec-card overflow-hidden rounded-xl border border-amber-200">
        <div className="flex items-center justify-between border-b border-amber-200 bg-amber-50 px-5 py-3 text-sm font-medium text-amber-800">
          <span className="flex items-center gap-2"><Icon name="alert" className="h-4 w-4" /> {t("needsReview", { count: emails.length })}</span>
          <button onClick={sel.toggleAll} className="text-xs font-medium text-amber-800 hover:underline">
            {sel.allSelected ? t("bulk.clearAll") : t("bulk.selectAll")}
          </button>
        </div>
        <ul className="divide-y divide-line">
          {emails.map((e) => (
            <ReviewRow key={e.id} email={e} clients={clients} matters={matters} checked={sel.selected.has(e.id)} onToggle={(shift) => sel.onRowToggle(e.id, shift)} />
          ))}
        </ul>
      </div>

      <BulkBar count={sel.selected.size} busy={sel.busy} onArchive={() => sel.runBulk(archiveEmails)} onDelete={() => sel.runBulk(deleteEmails)} onClear={sel.clear} />
      {sel.undo && <UndoToast label={sel.undo.label} busy={sel.busy} onUndo={sel.doUndo} onDismiss={sel.dismissUndo} />}
    </div>
  );
}
