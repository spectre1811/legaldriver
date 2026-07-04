"use client";

import { useFormState, useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import { updateNotificationPrefs, type ActionResult } from "./actions";

const initial: ActionResult = { ok: false, message: "" };

export type NotifPrefs = {
  whatsapp_number: string | null;
  channel_whatsapp: boolean;
  channel_email: boolean;
  channel_sms: boolean;
  quiet_start: string | null;
  quiet_end: string | null;
  cause_list_time: string | null;
};

// times come back as "HH:MM:SS" — the <input type=time> wants "HH:MM".
const hm = (v: string | null) => (v ? v.slice(0, 5) : "");

function Submit() {
  const { pending } = useFormStatus();
  const t = useTranslations("settings");
  return <button type="submit" disabled={pending} className="btn-primary">{pending ? t("notify.saving") : t("notify.save")}</button>;
}

function Toggle({ name, defaultChecked, label }: { name: string; defaultChecked: boolean; label: string }) {
  return (
    <label className="flex items-center gap-2.5 text-sm text-ink">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="h-4 w-4 rounded border-line accent-ec-ink" />
      {label}
    </label>
  );
}

export function NotificationForm({ prefs }: { prefs: NotifPrefs }) {
  const t = useTranslations("settings");
  const [state, action] = useFormState(updateNotificationPrefs, initial);
  return (
    <form action={action} className="space-y-4">
      <div className="max-w-xs">
        <label className="ec-label" htmlFor="n_whatsapp">{t("notify.whatsappNumber")}</label>
        <input id="n_whatsapp" name="whatsapp_number" defaultValue={prefs.whatsapp_number ?? ""} className="input mt-1.5 font-mono" inputMode="tel" placeholder={t("notify.whatsappPh")} />
      </div>

      <div>
        <p className="ec-label mb-2">{t("notify.channels")}</p>
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          <Toggle name="channel_whatsapp" defaultChecked={prefs.channel_whatsapp} label={t("notify.whatsapp")} />
          <Toggle name="channel_email" defaultChecked={prefs.channel_email} label={t("notify.email")} />
          <Toggle name="channel_sms" defaultChecked={prefs.channel_sms} label={t("notify.sms")} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div>
          <label className="ec-label" htmlFor="n_cl">{t("notify.causeListTime")}</label>
          <input id="n_cl" name="cause_list_time" type="time" defaultValue={hm(prefs.cause_list_time) || "07:00"} className="input mt-1.5" />
        </div>
        <div>
          <label className="ec-label" htmlFor="n_qs">{t("notify.quietStart")}</label>
          <input id="n_qs" name="quiet_start" type="time" defaultValue={hm(prefs.quiet_start)} className="input mt-1.5" />
        </div>
        <div>
          <label className="ec-label" htmlFor="n_qe">{t("notify.quietEnd")}</label>
          <input id="n_qe" name="quiet_end" type="time" defaultValue={hm(prefs.quiet_end)} className="input mt-1.5" />
        </div>
      </div>

      <p className="text-xs text-ink-faint">{t("notify.deliveryNote")}</p>
      <Submit />
      {state.message && (
        <p role="status" className={`rounded-xl px-3.5 py-2.5 text-sm ${state.ok ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>
          {state.message}
        </p>
      )}
    </form>
  );
}
