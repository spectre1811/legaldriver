"use client";

import { useFormState, useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import { createNotice, type ActionResult } from "./actions";

const initial: ActionResult = { ok: false, message: "" };

function Submit() {
  const { pending } = useFormStatus();
  const t = useTranslations("notices");
  return <button type="submit" disabled={pending} className="btn-primary">{pending ? t("form.submitPending") : t("form.submit")}</button>;
}

export function NoticeForm({ matters }: { matters: { id: string; title: string }[] }) {
  const t = useTranslations("notices");
  const [state, action] = useFormState(createNotice, initial);
  return (
    <form action={action} className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <input name="type" required placeholder={t("form.typePlaceholder")} className="input" aria-label={t("form.typeLabel")} />
        <input name="response_due" required type="date" className="input" aria-label={t("form.responseDueLabel")} />
        <select name="matter_id" className="input" aria-label={t("form.linkedCaseLabel")}>
          <option value="">{t("form.noLinkedCase")}</option>
          {matters.map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}
        </select>
      </div>
      <Submit />
      {state.message && (
        <p role="status" className={`rounded-xl px-3.5 py-2.5 text-sm ${state.ok ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>
          {state.message}
        </p>
      )}
    </form>
  );
}
