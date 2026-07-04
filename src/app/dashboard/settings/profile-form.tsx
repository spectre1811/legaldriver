"use client";

import { useFormState, useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import { updateProfile, type ActionResult } from "./actions";

const initial: ActionResult = { ok: false, message: "" };

type Profile = { full_name: string | null; phone: string | null; designation: string | null; chamber: string | null };

function Submit() {
  const { pending } = useFormStatus();
  const t = useTranslations("settings");
  return <button type="submit" disabled={pending} className="btn-primary">{pending ? t("profile.saving") : t("profile.save")}</button>;
}

export function ProfileForm({ profile }: { profile: Profile }) {
  const t = useTranslations("settings");
  const [state, action] = useFormState(updateProfile, initial);
  return (
    <form action={action} className="mt-5 space-y-3 border-t border-line pt-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="ec-label" htmlFor="p_full_name">{t("profile.fullName")}</label>
          <input id="p_full_name" name="full_name" defaultValue={profile.full_name ?? ""} className="input mt-1.5" autoComplete="name" />
        </div>
        <div>
          <label className="ec-label" htmlFor="p_phone">{t("profile.phone")}</label>
          <input id="p_phone" name="phone" defaultValue={profile.phone ?? ""} className="input mt-1.5" inputMode="tel" autoComplete="tel" placeholder={t("profile.phonePh")} />
        </div>
        <div>
          <label className="ec-label" htmlFor="p_designation">{t("profile.designation")}</label>
          <input id="p_designation" name="designation" defaultValue={profile.designation ?? ""} className="input mt-1.5" placeholder={t("profile.designationPh")} />
        </div>
        <div>
          <label className="ec-label" htmlFor="p_chamber">{t("profile.chamber")}</label>
          <input id="p_chamber" name="chamber" defaultValue={profile.chamber ?? ""} className="input mt-1.5" placeholder={t("profile.chamberPh")} />
        </div>
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
