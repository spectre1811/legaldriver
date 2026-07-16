"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import { addCalendarEntry, type ActionResult } from "./actions";
import { Icon } from "@/components/icons";
import { Combobox } from "@/components/combobox";

const initial: ActionResult = { ok: false, message: "" };

function Submit() {
  const { pending } = useFormStatus();
  const t = useTranslations("calendar");
  return <button type="submit" disabled={pending} className="btn-primary">{pending ? t("addEntry.adding") : t("addEntry.submit")}</button>;
}

export function AddEntry({ matters }: { matters: { id: string; title: string }[] }) {
  const [open, setOpen] = useState(false);
  const [matterId, setMatterId] = useState<string | null>(null);
  const [state, action] = useFormState(addCalendarEntry, initial);
  const t = useTranslations("calendar");

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="inline-flex h-9 items-center gap-1.5 rounded-ec-s bg-ec-honey px-3 text-[12.5px] font-medium text-ec-on-honey transition-colors hover:bg-ec-honey/90"
      >
        <Icon name="plus" className="h-3.5 w-3.5" /> {t("addEntry.open")}
      </button>
    );
  }
  return (
    <form action={action} className="card absolute right-0 top-12 z-10 w-80 space-y-3 p-4 shadow-lift">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">{t("addEntry.heading")}</h3>
        <button type="button" onClick={() => setOpen(false)} className="text-ink-faint hover:text-ink" aria-label={t("addEntry.close")}>✕</button>
      </div>
      <input name="title" required placeholder={t("addEntry.titlePlaceholder")} className="input" aria-label={t("addEntry.titleLabel")} />
      <div className="grid grid-cols-2 gap-2">
        <input name="event_date" type="date" required className="input" aria-label={t("addEntry.dateLabel")} />
        <select name="kind" className="input" aria-label={t("addEntry.kindLabel")}>
          <option value="event">{t("addEntry.kindEvent")}</option>
          <option value="meeting">{t("addEntry.kindMeeting")}</option>
          <option value="filing">{t("addEntry.kindFiling")}</option>
          <option value="reminder">{t("addEntry.kindReminder")}</option>
          <option value="deadline">{t("addEntry.kindDeadline")}</option>
        </select>
      </div>
      {/* Combobox is controlled; a hidden input carries the value into the form's FormData. */}
      <input type="hidden" name="matter_id" value={matterId ?? ""} />
      <Combobox
        label={t("addEntry.matterLabel")} placeholder={t("addEntry.noLinkedCase")}
        options={matters.map((m) => ({ value: m.id, label: m.title }))}
        value={matterId} onChange={setMatterId}
      />
      <Submit />
      {state.message && (
        <p role="status" className={`rounded-lg px-3 py-2 text-xs ${state.ok ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>
          {state.message}
        </p>
      )}
    </form>
  );
}
