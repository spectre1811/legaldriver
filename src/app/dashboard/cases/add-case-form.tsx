"use client";

// WO-346 exact-fidelity reconcile vs. design-mockups/iteration3/console/cases.tsx's Add-a-case
// modal: ONE form whose target action swaps between the CNR lookup and the manual create (the
// CNR field always stays visible per the reference; the manual toggle just adds fields below it),
// closing with a single persistent Cancel/Add-case footer — instead of two separately-submitted
// forms each with their own inline button. Real behaviour is unchanged: CNR-first fetch, manual
// fallback (auto-revealed on a failed lookup), honest success/error feedback.
import { useEffect, useRef, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { addCaseByCnr, createManualMatter, type ActionResult } from "./actions";
import { Combobox } from "@/components/combobox";

const initial: ActionResult = { ok: false, message: "" };
const manualInitial: { ok: boolean; message: string; matterId?: string } = { ok: false, message: "" };

function SubmitButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="ec-btn ec-btn-ink flex-1">
      {pending ? pendingLabel : label}
    </button>
  );
}

export function AddCaseForm({
  autoCnr, autoFocus, courts, onCancel,
}: { autoCnr?: string; autoFocus?: boolean; courts: string[]; onCancel: () => void }) {
  const t = useTranslations("cases");
  const tc = useTranslations("common");
  const router = useRouter();
  const [state, formAction] = useFormState(addCaseByCnr, initial);
  const [manualState, manualAction] = useFormState(createManualMatter, manualInitial);
  const [manualOpen, setManualOpen] = useState(false);
  const [court, setCourt] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const autoFired = useRef(false);

  // ?track=<CNR> deep link from /login (WO-50/WO-51): submit the prefilled CNR
  // once, then strip the param so a refresh doesn't re-fire the lookup.
  useEffect(() => {
    if (autoCnr && !autoFired.current) {
      autoFired.current = true;
      formRef.current?.requestSubmit();
    }
  }, [autoCnr]);
  // A failed autoCnr attempt still strips the `track` param so a refresh doesn't re-fire the
  // lookup, but leaves the advocate in the modal — the "add manually" fallback below reveals
  // itself via the cnrFailed effect. A SUCCESSFUL attempt is handled by the redirect effect
  // below instead (WO-401 A2): it navigates away, which unmounts this page's `track` param too.
  useEffect(() => {
    if (autoCnr && state.message && !state.ok) router.replace("/dashboard/cases", { scroll: false });
  }, [autoCnr, state.message, state.ok, router]);

  // WO-401 A2 — on a SUCCESSFUL CNR add (manual submit or the ?track= auto-submit), the case
  // now exists: go straight to its page, mirroring the manual-create path below, instead of
  // leaving the modal open on an inline "Re-synced…" message. Navigating away unmounts the
  // modal too, so no separate close call is needed.
  useEffect(() => {
    if (state.ok && state.matterId) router.push(`/dashboard/cases/${state.matterId}`);
  }, [state.ok, state.matterId, router]);

  // A failed CNR lookup is the moment the "add it manually" promise must lead somewhere:
  // reveal the manual fields so the advocate never hits a dead end (WO-35 #2).
  const cnrFailed = Boolean(state.message) && !state.ok;
  useEffect(() => {
    if (cnrFailed) setManualOpen(true);
  }, [cnrFailed, state.message]);

  // On a successful manual create, go straight to the new case.
  useEffect(() => {
    if (manualState.ok && manualState.matterId) router.push(`/dashboard/cases/${manualState.matterId}`);
  }, [manualState.ok, manualState.matterId, router]);

  const activeMessage = manualOpen ? manualState.message : state.message;
  const activeOk = manualOpen ? manualState.ok : state.ok;

  return (
    <form ref={formRef} action={manualOpen ? manualAction : formAction} className="space-y-4">
      <div>
        <label htmlFor="cnr" className="ec-label mb-1 flex items-baseline gap-1">
          {t("add.cnrLabel")} <span className="text-ec-danger">*</span>
        </label>
        <input
          id="cnr"
          name="cnr"
          required={!manualOpen}
          autoFocus={autoFocus}
          defaultValue={autoCnr}
          maxLength={16}
          placeholder={t("add.placeholder")}
          aria-label={t("add.aria")}
          className="input num font-mono uppercase tracking-[0.06em]"
        />
        <p className="mt-1 text-[11.5px] text-ec-ink-3">{t("add.cnrHint")}</p>
      </div>

      <p className="text-[12.5px] text-ec-ink-3">{t("add.pullBody")}</p>

      <button
        type="button"
        onClick={() => setManualOpen((v) => !v)}
        aria-expanded={manualOpen}
        className="text-[12.5px] font-medium text-ec-bronze-deep hover:underline"
      >
        {manualOpen ? t("manual.toggleHide") : t("manual.toggle")}
      </button>

      {manualOpen && (
        <div className="grid gap-3 border-t border-ec-hair pt-4 sm:grid-cols-2">
          <p className="text-xs text-ec-ink-3 sm:col-span-2">{t("manual.help")}</p>
          <div className="sm:col-span-2">
            <label className="ec-label mb-1 flex items-baseline gap-1">
              {t("manual.titleLabel")} <span className="text-ec-danger">*</span>
            </label>
            <input name="title" required placeholder={t("manual.titlePlaceholder")} className="input" />
          </div>
          <div>
            <label className="ec-label mb-1 block">{t("manual.caseNumberLabel")}</label>
            <input name="case_number" placeholder={t("manual.caseNumberPlaceholder")} className="input num font-mono" />
          </div>
          <div>
            <label className="ec-label mb-1 block">{t("manual.courtLabel")}</label>
            <Combobox
              label={t("manual.courtLabel")}
              placeholder={t("manual.courtSelectPlaceholder")}
              options={courts.map((c) => ({ value: c, label: c }))}
              value={court}
              onChange={setCourt}
            />
            <input type="hidden" name="court" value={court ?? ""} />
          </div>
          <div>
            <label className="ec-label mb-1 block">{t("manual.nextLabel")}</label>
            <input name="next_hearing_date" type="date" className="input num font-mono" />
          </div>
        </div>
      )}

      {activeMessage && (
        <p role="status" className={`rounded-ec-s px-3.5 py-2.5 text-sm ${activeOk ? "bg-ec-success-t text-ec-success" : "bg-ec-warn-t text-ec-warn"}`}>
          {activeMessage}
        </p>
      )}

      <div className="flex gap-2 border-t border-ec-hair pt-4">
        <button type="button" onClick={onCancel} className="ec-btn ec-btn-ghost">
          {tc("actions.cancel")}
        </button>
        <SubmitButton
          label={t("add.cta")}
          pendingLabel={manualOpen ? t("manual.creating") : t("add.fetching")}
        />
      </div>
    </form>
  );
}
