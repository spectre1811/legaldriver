"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import { addCalendarEntry, type ActionResult } from "./actions";
import { Icon } from "@/components/icons";

const initial: ActionResult = { ok: false, message: "" };

function Submit() {
  const { pending } = useFormStatus();
  const t = useTranslations("calendar");
  return <button type="submit" disabled={pending} className="btn-primary">{pending ? t("addEntry.adding") : t("addEntry.submit")}</button>;
}

export function AddEntry({ matters }: { matters: { id: string; title: string }[] }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useFormState(addCalendarEntry, initial);
  const t = useTranslations("calendar");

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="btn-secondary">
        <Icon name="plus" className="h-4 w-4" /> {t("addEntry.open")}
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
      <select name="matter_id" className="input" aria-label={t("addEntry.matterLabel")}>
        <option value="">{t("addEntry.noLinkedCase")}</option>
        {matters.map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}
      </select>
      <Submit />
      {state.message && (
        <p role="status" className={`rounded-lg px-3 py-2 text-xs ${state.ok ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>
          {state.message}
        </p>
      )}
    </form>
  );
}
