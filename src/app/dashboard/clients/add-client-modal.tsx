"use client";

// WO-347 · the "+ Add client" trigger + its 2-step wizard (design-mockups/iteration3/console/
// app.clients.tsx's <AddClientDialog> — Step 1 "Identity & contact" / Step 2 "Practice & billing").
// Chrome now composes the shared <Dialog> (components/ui/dialog.tsx, WO-340) instead of
// hand-rolling the backdrop/Esc/scroll-lock again. All the wizard's field STATE lives in the
// inner <ClientWizard> — mounted only while the dialog is open (Dialog returns null when closed,
// so the field state resets for free on every reopen, same as the reference's own
// `if (!open) return null`).
//
// Real vs. reference: name/type/language/billing/link-matters all write to real columns (name,
// type) or the client's `custom` jsonb (no migration — see actions.ts). "Link matters" searches
// this tenant's currently-UNLINKED matters (client_id IS NULL) — the honest analogue of the
// reference's fabricated CASE_INDEX, and on submit retro-links the chosen ones (matter.client_id
// already exists; no schema change). Practice area is free text + a datalist of this tenant's
// real practice areas (reference fidelity for the WIDGET); the server resolves it onto the real
// `practice_area` table (case-insensitive match, else a new row) so downstream filtering/grouping
// by area keeps working. The conflict box keeps the real check (checkConflicts/runConflictCheck)
// but is now gated by an actual acknowledgement checkbox (reference fidelity) instead of the old
// double-submit dance, restyled to --warn tokens (never raw amber).
import { useEffect, useState, useTransition } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/icons";
import { Dialog } from "@/components/ui/dialog";
import { Segmented } from "../cases/segmented";
import { addClient, runConflictCheck, type IntakeResult } from "./actions";
import type { ConflictHit } from "@/lib/conflict";

export type AreaOpt = { id: string; name: string };
export type MatterOpt = { id: string; label: string };

const initial: IntakeResult = { ok: false, message: "" };

function RepeatRows({
  name,
  label,
  placeholder,
  type,
  values,
  setValues,
}: {
  name: string;
  label: string;
  placeholder: string;
  type?: string;
  values: string[];
  setValues: (updater: (rows: string[]) => string[]) => void;
}) {
  const ti = useTranslations("clients.intake");
  return (
    <div>
      <span className="eyebrow">{label}</span>
      <div className="mt-1.5 space-y-2">
        {values.map((v, i) => (
          <div key={i} className="flex gap-2">
            <input
              name={name} type={type} value={v} placeholder={placeholder} className="input"
              onChange={(e) => setValues((rows) => rows.map((x, j) => (j === i ? e.target.value : x)))}
            />
            <button
              type="button"
              aria-label={i === values.length - 1 ? ti("addAnother") : ti("remove")}
              onClick={() =>
                i === values.length - 1
                  ? setValues((rows) => [...rows, ""])
                  : setValues((rows) => rows.filter((_, j) => j !== i))
              }
              className="shrink-0 rounded-ec-s border border-ec-line px-2 text-ec-muted-ink transition-colors hover:border-ec-bronze hover:text-ec-bronze"
            >
              <Icon name={i === values.length - 1 ? "plus" : "minus"} className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function SubmitButton() {
  const ti = useTranslations("clients.intake");
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="ec-btn ec-btn-ink flex-1 justify-center">
      {pending ? ti("adding") : ti("addClient")}
    </button>
  );
}

function ClientWizard({
  practiceAreas,
  matterOpts,
  onClose,
}: {
  practiceAreas: AreaOpt[];
  matterOpts: MatterOpt[];
  onClose: () => void;
}) {
  const t = useTranslations("dashboard.clients");
  const ti = useTranslations("clients.intake");
  const router = useRouter();
  const [state, action] = useFormState(addClient, initial);

  const [step, setStep] = useState<1 | 2>(1);

  // Step 1
  const [name, setName] = useState("");
  const [type, setType] = useState<"individual" | "org">("individual");
  const [lang, setLang] = useState<"en" | "hi">("en");
  const [emails, setEmails] = useState<string[]>([""]);
  const [phones, setPhones] = useState<string[]>([""]);
  const [conflicts, setConflicts] = useState<ConflictHit[]>([]);
  const [checking, startCheck] = useTransition();
  const [ack, setAck] = useState(false);

  // Step 2
  const [billingType, setBillingType] = useState<"Hourly" | "Fixed" | "Retainer">("Hourly");
  const [matterQ, setMatterQ] = useState("");
  const [linked, setLinked] = useState<MatterOpt[]>([]);

  useEffect(() => {
    if (state.ok) { onClose(); router.refresh(); }
  }, [state.ok, onClose, router]);

  const matterHits = matterQ.trim()
    ? matterOpts.filter((m) => m.label.toLowerCase().includes(matterQ.trim().toLowerCase()) && !linked.some((l) => l.id === m.id)).slice(0, 4)
    : [];

  const billingAmountPlaceholder =
    billingType === "Hourly" ? ti("billingAmountHourly") : billingType === "Fixed" ? ti("billingAmountFixed") : ti("billingAmountRetainer");

  const step1Blocked = !name.trim() || (conflicts.length > 0 && !ack);

  return (
    <form action={action} className="flex max-h-[92vh] flex-col">
      {/* hidden mirrors for JS-controlled fields (Segmented/typeahead aren't native inputs) */}
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="preferred_language" value={lang} />
      <input type="hidden" name="billing_type" value={billingType} />
      <input type="hidden" name="ack_conflicts" value={ack ? "1" : ""} />
      {linked.map((m) => (
        <input key={m.id} type="hidden" name="link_matter" value={m.id} />
      ))}

      <div className="flex items-start justify-between gap-4 border-b border-ec-line px-5 py-4">
        <div className="min-w-0">
          <p className="eyebrow">{ti("stepOf", { step })}</p>
          <h2 id="add-client-title" className="display mt-0.5 text-[20px] leading-tight text-ec-ink">
            {step === 1 ? ti("step1Title") : ti("step2Title")}
          </h2>
        </div>
        <button
          type="button" onClick={onClose} aria-label={t("close")}
          className="shrink-0 rounded-ec-s p-1 text-ec-muted-ink transition hover:bg-ec-paper-3 hover:text-ec-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ec-honey"
        >
          <Icon name="close" className="h-4 w-4" />
        </button>
      </div>

      <div className="max-h-[60vh] space-y-4 overflow-y-auto px-5 py-5">
        {/* step rail */}
        <div className="flex items-center gap-2">
          {[ti("step1Title"), ti("step2Title")].map((s, i) => (
            <span key={s} className="flex items-center gap-2">
              <span className={`num grid h-[18px] w-[18px] place-items-center rounded-full text-[10px] ${step === i + 1 ? "bg-ec-honey text-ec-honey-ink" : "bg-ec-paper-3 text-ec-muted-ink"}`}>
                {i + 1}
              </span>
              <span className={`text-[12px] ${step === i + 1 ? "font-medium text-ec-ink" : "text-ec-muted-ink"}`}>{s}</span>
              {i === 0 && <span className="h-px w-6 bg-ec-line" />}
            </span>
          ))}
        </div>

        <div className={step === 1 ? "space-y-4" : "hidden"}>
          <div>
            <label className="eyebrow" htmlFor="wizard-name">
              {ti("clientName")}<span className="text-ec-danger"> *</span>
            </label>
            <div className="mt-1.5">
              <input
                id="wizard-name" name="name" required value={name}
                onChange={(e) => { setName(e.target.value); setConflicts([]); }}
                onBlur={() => name.trim().length > 2 && startCheck(async () => setConflicts(await runConflictCheck(name)))}
                placeholder={ti("namePlaceholder")} className="input"
              />
            </div>
          </div>

          {(checking || conflicts.length > 0) && (
            <div className="rounded-ec-s bg-ec-warn-bg px-3 py-2.5">
              <p className="flex items-start gap-2 text-[12.5px] text-ec-warn">
                <Icon name="alert" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {checking ? ti("checkingConflicts") : ti("possibleConflicts", { count: conflicts.length })}
              </p>
              {conflicts.length > 0 && (
                <>
                  <ul className="mt-2 space-y-1 text-[12.5px] text-ec-warn">
                    {conflicts.map((c, i) => (
                      <li key={i} className="flex items-center justify-between gap-2">
                        <span className="truncate">{c.name} <span className="opacity-80">· {c.where}</span></span>
                        <span className="num shrink-0 text-[11px]">{ti("matchPercent", { percent: Math.round(c.score * 100) })}</span>
                      </li>
                    ))}
                  </ul>
                  <label className="mt-2 flex items-center gap-2 text-[12.5px] text-ec-warn">
                    <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="h-3.5 w-3.5 accent-[var(--warn)]" />
                    {ti("conflictAck")}
                  </label>
                </>
              )}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <span className="eyebrow">{ti("type")}</span>
              <div className="mt-1.5">
                <Segmented
                  label={ti("type")} value={type} onChange={(v) => setType(v as "individual" | "org")}
                  options={[{ value: "individual", label: ti("typeIndividual") }, { value: "org", label: ti("typeOrg") }]}
                />
              </div>
            </div>
            <div>
              <span className="eyebrow">{ti("preferredLanguage")}</span>
              <div className="mt-1.5">
                <Segmented
                  label={ti("preferredLanguage")} value={lang} onChange={(v) => setLang(v as "en" | "hi")}
                  options={[{ value: "en", label: ti("languageEnglish") }, { value: "hi", label: ti("languageHindi") }]}
                />
              </div>
            </div>
          </div>

          {type === "org" && (
            <div>
              <label className="eyebrow" htmlFor="wizard-contact-person">{ti("contactPerson")}</label>
              <div className="mt-1.5">
                <input id="wizard-contact-person" name="contact_person" className="input" placeholder={ti("contactPersonPlaceholder")} />
              </div>
              <p className="mt-1 text-[11.5px] text-ec-muted-ink">{ti("contactPersonHint")}</p>
            </div>
          )}

          <RepeatRows name="email" label={ti("email")} placeholder={ti("emailPlaceholder")} type="email" values={emails} setValues={setEmails} />
          <RepeatRows name="phone" label={ti("phone")} placeholder={ti("phonePlaceholder")} type="tel" values={phones} setValues={setPhones} />
        </div>

        <div className={step === 2 ? "space-y-4" : "hidden"}>
          <div>
            <label className="eyebrow" htmlFor="wizard-practice-area">{ti("practiceArea")}</label>
            <div className="mt-1.5">
              <input id="wizard-practice-area" name="practice_area" list="wizard-practice-areas" className="input" placeholder={ti("practiceAreaFreeTextPlaceholder")} />
              <datalist id="wizard-practice-areas">
                {practiceAreas.map((a) => <option key={a.id} value={a.name} />)}
              </datalist>
            </div>
          </div>

          <div>
            <label className="eyebrow" htmlFor="wizard-address">{ti("address")}</label>
            <div className="mt-1.5">
              <textarea id="wizard-address" name="address" rows={2} className="input resize-none" placeholder={ti("addressPlaceholder")} />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="eyebrow" htmlFor="wizard-referral">{ti("referralSource")}</label>
              <div className="mt-1.5">
                <input id="wizard-referral" name="referral_source" className="input" placeholder={ti("referralPlaceholder")} />
              </div>
              <p className="mt-1 text-[11.5px] text-ec-muted-ink">{ti("referralHint")}</p>
            </div>
            <div>
              <label className="eyebrow" htmlFor="wizard-id-note">{ti("idNote")}</label>
              <div className="mt-1.5">
                <input id="wizard-id-note" name="id_note" className="input" placeholder={ti("idNotePlaceholder")} />
              </div>
              <p className="mt-1 text-[11.5px] text-ec-muted-ink">{ti("idNoteHint")}</p>
            </div>
          </div>

          <div>
            <span className="eyebrow">{ti("billingArrangement")}</span>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <Segmented
                label={ti("billingArrangement")} value={billingType} onChange={(v) => setBillingType(v as "Hourly" | "Fixed" | "Retainer")}
                options={[{ value: "Hourly", label: ti("billingHourly") }, { value: "Fixed", label: ti("billingFixed") }, { value: "Retainer", label: ti("billingRetainer") }]}
              />
              <input name="billing_amount" className="input num flex-1" placeholder={billingAmountPlaceholder} inputMode="numeric" />
            </div>
          </div>

          <div>
            <span className="eyebrow">{ti("linkMatters")}</span>
            <div className="mt-1.5">
              <input
                value={matterQ} onChange={(e) => setMatterQ(e.target.value)}
                className="input" placeholder={ti("linkMattersPlaceholder")}
              />
              {matterHits.length > 0 && (
                <ul className="mt-1 divide-y divide-ec-line rounded-ec-s border border-ec-line bg-ec-card">
                  {matterHits.map((m) => (
                    <li key={m.id}>
                      <button
                        type="button"
                        onClick={() => { setLinked((l) => [...l, m]); setMatterQ(""); }}
                        className="block w-full px-3 py-2 text-left text-[12.5px] text-ec-ink-2 hover:bg-ec-bronze-tint/30"
                      >
                        {m.label}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {linked.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {linked.map((m) => (
                    <button key={m.id} type="button" onClick={() => setLinked((l) => l.filter((x) => x.id !== m.id))} className="ec-chip ec-chip-hot">
                      {m.label} ✕
                    </button>
                  ))}
                </div>
              )}
              <p className="mt-2 text-[11.5px] text-ec-muted-ink">{ti("linkMattersHint")}</p>
            </div>
          </div>

          <div>
            <label className="eyebrow" htmlFor="wizard-notes">{ti("notes")}</label>
            <div className="mt-1.5">
              <textarea id="wizard-notes" name="notes" rows={2} className="input resize-none" placeholder={ti("notesPlaceholder")} />
            </div>
          </div>
        </div>
      </div>

      {state.message && !state.ok && (
        <p className="px-5 pb-1 text-[12.5px] text-ec-warn">{state.message}</p>
      )}

      <div className="flex gap-2 border-t border-ec-line px-5 py-4">
        <button
          type="button" onClick={() => (step === 1 ? onClose() : setStep(1))}
          className="rounded-ec-s border border-ec-line px-3 py-2 text-[13px] text-ec-ink-2"
        >
          {step === 1 ? ti("cancel") : ti("back")}
        </button>
        {step === 1 ? (
          <button
            type="button" disabled={step1Blocked} onClick={() => setStep(2)}
            className="ec-btn ec-btn-ink flex-1 justify-center disabled:opacity-40"
          >
            {ti("continueLabel")}
          </button>
        ) : (
          <SubmitButton />
        )}
      </div>
    </form>
  );
}

export function AddClientButton({ practiceAreas, matterOpts }: { practiceAreas: AreaOpt[]; matterOpts: MatterOpt[] }) {
  const t = useTranslations("dashboard.clients");
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="ec-btn ec-btn-ink shrink-0 px-3.5 py-2 text-xs">
        <Icon name="plus" className="h-3.5 w-3.5" /> {t("addClient")}
      </button>

      <Dialog open={open} onClose={close} labelledBy="add-client-title" className="max-w-xl">
        <ClientWizard practiceAreas={practiceAreas} matterOpts={matterOpts} onClose={close} />
      </Dialog>
    </>
  );
}
