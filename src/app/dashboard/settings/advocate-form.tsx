"use client";

import { useFormState, useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import { addAdvocate, type ActionResult } from "./actions";
import { STATE_BAR_COUNCILS } from "@/lib/court/bar-number";

const initial: ActionResult = { ok: false, message: "" };

function Submit() {
  const { pending } = useFormStatus();
  const t = useTranslations("settings");
  return <button type="submit" disabled={pending} className="btn-primary">{pending ? t("advocates.saving") : t("advocates.add")}</button>;
}

// WO-42: one structured enrollment field + an explicit State Bar Council select
// (replaces the confusing bar-no + separate "eCourts bar code" + free-text state trio
// that split ONE identifier into three and never collected the enrollment year).
export function AdvocateForm() {
  const t = useTranslations("settings");
  const [state, action] = useFormState(addAdvocate, initial);
  return (
    <form action={action} className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <input name="name" required placeholder={t("advocates.nameLabel")} className="input" aria-label={t("advocates.nameLabel")} />
        <input
          name="bar_registration_number"
          placeholder={t("advocates.barPlaceholder")}
          className="input font-mono uppercase"
          aria-label={t("advocates.barLabel")}
          autoCapitalize="characters"
        />
        <select name="state_bar_council" defaultValue="" className="input" aria-label={t("advocates.councilLabel")}>
          <option value="" disabled>{t("advocates.councilPlaceholder")}</option>
          {STATE_BAR_COUNCILS.map((c) => (
            <option key={c.id} value={c.id}>{c.label}{c.verified ? " ✓" : ""}</option>
          ))}
        </select>
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
