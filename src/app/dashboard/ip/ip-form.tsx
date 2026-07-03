"use client";

import { useFormState, useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import { addIpAsset, type ActionResult } from "./actions";

const initial: ActionResult = { ok: false, message: "" };

function Submit() {
  const { pending } = useFormStatus();
  const t = useTranslations("ip");
  return <button type="submit" disabled={pending} className="btn-primary">{pending ? t("form.saving") : t("form.addAsset")}</button>;
}

export function IpForm() {
  const t = useTranslations("ip");
  const [state, action] = useFormState(addIpAsset, initial);
  return (
    <form action={action} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <input name="title" required placeholder={t("form.titlePlaceholder")} className="input" aria-label={t("form.title")} />
        <select name="type" className="input" aria-label={t("form.type")}>
          <option value="trademark">{t("type.trademark")}</option>
          <option value="patent">{t("type.patent")}</option>
          <option value="copyright">{t("type.copyright")}</option>
          <option value="design">{t("type.design")}</option>
        </select>
        <input name="registration_no" placeholder={t("form.registrationNoPlaceholder")} className="input" aria-label={t("form.registrationNo")} />
        <input name="jurisdiction" placeholder={t("form.jurisdictionPlaceholder")} className="input" aria-label={t("form.jurisdiction")} />
        <div className="sm:col-span-2">
          <label className="label" htmlFor="renewal_date">{t("form.renewalDate")}</label>
          <input id="renewal_date" name="renewal_date" type="date" className="input mt-1.5" />
        </div>
      </div>
      <Submit />
      {state.message && (
        <p role="status" className={`rounded-xl px-3.5 py-2.5 text-sm ${state.ok ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>{state.message}</p>
      )}
    </form>
  );
}
