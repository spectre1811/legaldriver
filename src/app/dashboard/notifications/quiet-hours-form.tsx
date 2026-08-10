"use client";

// WO-336 · Quiet hours + evening brief, styled to the Chambers prototype's app.notifications.tsx
// but wired to the SAME server action Settings already uses (updateNotificationPrefs) — never a
// forked mutation. That action upserts the WHOLE notification_prefs row, so the WhatsApp/email/SMS
// fields this form doesn't render are carried through as hidden inputs (their current DB values) —
// omitting them would silently null out the advocate's channel prefs on every save from this page.
// WAVE-2 exact-fidelity: the reference's two `<Eyebrow>` column headings + descriptive paragraphs,
// the Clock3 icon before "Brief at", and the bronze/neutral chip pair all live INSIDE this form now
// (they'd drifted out into page.tsx in WAVE-1) — same slots, same order as the reference.
import { useFormState, useFormStatus } from "react-dom";
import { Icon } from "@/components/icons";
import { updateNotificationPrefs, type ActionResult } from "../settings/actions";

const initial: ActionResult = { ok: false, message: "" };

const timeInputClass =
  "num rounded-md border border-ec-line bg-ec-paper px-2 py-1 font-mono text-[12.5px] text-ec-ink outline-none transition-colors focus:border-ec-bronze";

// times come back "HH:MM:SS" — <input type=time> wants "HH:MM".
const hm = (v: string | null) => (v ? v.slice(0, 5) : "");

function SaveButton({ label, savingLabel }: { label: string; savingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="ec-btn ec-btn-ink press mt-4 self-start text-[12.5px]">
      {pending ? savingLabel : label}
    </button>
  );
}

export function QuietHoursForm({
  prefs,
  t,
}: {
  prefs: {
    whatsapp_number: string | null;
    channel_whatsapp: boolean;
    channel_email: boolean;
    channel_sms: boolean;
    quiet_start: string | null;
    quiet_end: string | null;
    cause_list_time: string | null;
  };
  t: {
    eveningBrief: string;
    eveningBriefBody: string;
    briefAt: string;
    ist: string;
    digest: string;
    instant: string;
    instantSoon: string;
    quietHours: string;
    quietHoursBody: string;
    quietFrom: string;
    quietTo: string;
    chipSaved: string;
    chipChannels: string;
    save: string;
    saving: string;
  };
}) {
  const [state, action] = useFormState(updateNotificationPrefs, initial);
  return (
    <form action={action} className="contents">
      {/* carried through unchanged — see file header */}
      <input type="hidden" name="whatsapp_number" value={prefs.whatsapp_number ?? ""} />
      {prefs.channel_whatsapp && <input type="hidden" name="channel_whatsapp" value="on" />}
      {prefs.channel_email && <input type="hidden" name="channel_email" value="on" />}
      {prefs.channel_sms && <input type="hidden" name="channel_sms" value="on" />}

      <div className="min-w-0">
        <p className="ec-label">{t.eveningBrief}</p>
        <p className="mt-1.5 text-[13px] text-ec-ink-2">{t.eveningBriefBody}</p>
        <label className="mt-3 flex flex-wrap items-center gap-2 text-[13px] text-ec-ink-2" htmlFor="wo336_brief">
          <Icon name="clock" className="h-3.5 w-3.5 text-ec-bronze" />
          {t.briefAt}
          <input id="wo336_brief" type="time" name="cause_list_time" defaultValue={hm(prefs.cause_list_time) || "07:00"} className={timeInputClass} />
          <span className="ec-label">{t.ist}</span>
        </label>
        <div className="mt-4 inline-flex items-center gap-[3px] rounded-md border border-ec-line bg-ec-card p-[3px]" role="tablist" aria-label={t.briefAt}>
          <span aria-selected="true" role="tab" className="rounded-[4px] bg-ec-bronze-tint px-2.5 py-1 text-[12px] font-medium text-ec-bronze-deep">
            {t.digest}
          </span>
          <span aria-selected="false" role="tab" aria-disabled="true" title={t.instantSoon} className="cursor-not-allowed rounded-[4px] px-2.5 py-1 text-[12px] font-medium text-ec-muted-ink opacity-60">
            {t.instant}
          </span>
        </div>
      </div>

      <div className="min-w-0 border-t border-ec-line pt-5 sm:border-l sm:border-t-0 sm:pl-6 sm:pt-0">
        <p className="ec-label">{t.quietHours}</p>
        <p className="mt-1.5 text-[13px] text-ec-ink-2">{t.quietHoursBody}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-[13px] text-ec-ink-2">
          <input aria-label={t.quietFrom} type="time" name="quiet_start" defaultValue={hm(prefs.quiet_start)} className={timeInputClass} />
          <span className="text-ec-muted-ink">{t.quietTo}</span>
          <input aria-label={t.quietTo} type="time" name="quiet_end" defaultValue={hm(prefs.quiet_end)} className={timeInputClass} />
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <span className="ec-chip ec-chip-hot">{t.chipSaved}</span>
          <span className="ec-chip">{t.chipChannels}</span>
        </div>
        <SaveButton label={t.save} savingLabel={t.saving} />
        {state.message && (
          <p role="status" className={`mt-2 text-[12px] ${state.ok ? "text-ec-success" : "text-ec-danger"}`}>
            {state.message}
          </p>
        )}
      </div>
    </form>
  );
}
