"use client";

import { useFormState, useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import { addAdvocate, type ActionResult } from "./actions";

const initial: ActionResult = { ok: false, message: "" };

function Submit() {
  const { pending } = useFormStatus();
  const t = useTranslations("settings");
  return <button type="submit" disabled={pending} className="btn-primary">{pending ? t("advocates.saving") : t("advocates.add")}</button>;
}

export function AdvocateForm() {
  const t = useTranslations("settings");
  const [state, action] = useFormState(addAdvocate, initial);
  return (
    <form action={action} className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <input name="name" required placeholder={t("advocates.nameLabel")} className="input" aria-label={t("advocates.nameLabel")} />
        <input name="bar_registration_number" placeholder={t("advocates.barPlaceholder")} className="input font-mono uppercase" aria-label={t("advocates.barLabel")} />
        <input name="bar_code" placeholder={t("advocates.barCodePlaceholder")} className="input font-mono" aria-label={t("advocates.barCodeLabel")} inputMode="numeric" />
        <input name="state_code" placeholder={t("advocates.statePlaceholder")} className="input uppercase" aria-label={t("advocates.stateLabel")} />
      </div>
      <p className="text-xs text-ink-faint">{t.rich("advocates.hint", { b: (c) => <strong>{c}</strong> })}</p>
      <Submit />
      {state.message && (
        <p role="status" className={`rounded-xl px-3.5 py-2.5 text-sm ${state.ok ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>
          {state.message}
        </p>
      )}
    </form>
  );
}
