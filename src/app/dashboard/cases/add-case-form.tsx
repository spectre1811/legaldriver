"use client";

import { useEffect, useRef, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { addCaseByCnr, createManualMatter, type ActionResult } from "./actions";
import { Icon } from "@/components/icons";

const initial: ActionResult = { ok: false, message: "" };
const manualInitial: { ok: boolean; message: string; matterId?: string } = { ok: false, message: "" };

function SubmitButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="ec-btn ec-btn-ink shrink-0">
      <Icon name="plus" className="h-4 w-4" /> {pending ? pendingLabel : label}
    </button>
  );
}

export function AddCaseForm({ autoCnr, autoFocus }: { autoCnr?: string; autoFocus?: boolean }) {
  const t = useTranslations("cases");
  const router = useRouter();
  const [state, formAction] = useFormState(addCaseByCnr, initial);
  const [manualState, manualAction] = useFormState(createManualMatter, manualInitial);
  const [manualOpen, setManualOpen] = useState(false);
  const cnrFormRef = useRef<HTMLFormElement>(null);
  const autoFired = useRef(false);

  // ?track=<CNR> deep link from /login (WO-50/WO-51): submit the prefilled CNR
  // once, then strip the param so a refresh doesn't re-fire the lookup.
  useEffect(() => {
    if (autoCnr && !autoFired.current) {
      autoFired.current = true;
      cnrFormRef.current?.requestSubmit();
    }
  }, [autoCnr]);
  useEffect(() => {
    if (autoCnr && state.message) router.replace("/dashboard/cases", { scroll: false });
  }, [autoCnr, state.message, router]);

  // A failed CNR lookup is the moment the "add it manually" promise must lead somewhere:
  // reveal the manual form so the advocate never hits a dead end (WO-35 #2).
  const cnrFailed = Boolean(state.message) && !state.ok;
  useEffect(() => {
    if (cnrFailed) setManualOpen(true);
  }, [cnrFailed, state.message]);

  // On a successful manual create, go straight to the new case.
  useEffect(() => {
    if (manualState.ok && manualState.matterId) router.push(`/dashboard/cases/${manualState.matterId}`);
  }, [manualState.ok, manualState.matterId, router]);

  return (
    <div className="space-y-3">
      <form ref={cnrFormRef} action={formAction} className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ec-ink-3" />
            <input
              name="cnr"
              required
              autoFocus={autoFocus}
              defaultValue={autoCnr}
              placeholder={t("add.placeholder")}
              aria-label={t("add.aria")}
              className="input num pl-9 uppercase"
            />
          </div>
          <SubmitButton label={t("add.cta")} pendingLabel={t("add.fetching")} />
        </div>
        {state.message && (
          <p role="status" className={`rounded-ec-s px-3.5 py-2.5 text-sm ${state.ok ? "bg-ec-success-t text-ec-success" : "bg-ec-warn-t text-ec-warn"}`}>
            {state.message}
          </p>
        )}
      </form>

      <div className="border-t border-ec-hair pt-3">
        <button
          type="button"
          onClick={() => setManualOpen((v) => !v)}
          aria-expanded={manualOpen}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-ec-ink-2 hover:text-ec-brass-deep"
        >
          <Icon name={manualOpen ? "chevron" : "plus"} className="h-3.5 w-3.5" /> {t("manual.toggle")}
        </button>

        {manualOpen && (
          <form action={manualAction} className="mt-3 space-y-3">
            <p className="text-xs text-ec-ink-3">{t("manual.help")}</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="ec-label mb-1 block">{t("manual.titleLabel")}</label>
                <input name="title" required placeholder={t("manual.titlePlaceholder")} className="input" />
              </div>
              <div>
                <label className="ec-label mb-1 block">{t("manual.courtLabel")}</label>
                <input name="court" placeholder={t("manual.courtPlaceholder")} className="input" />
              </div>
              <div>
                <label className="ec-label mb-1 block">{t("manual.typeLabel")}</label>
                <input name="case_type" placeholder={t("manual.typePlaceholder")} className="input" />
              </div>
              <div>
                <label className="ec-label mb-1 block">{t("manual.nextLabel")}</label>
                <input name="next_hearing_date" type="date" className="input" />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <SubmitButton label={t("manual.cta")} pendingLabel={t("manual.creating")} />
              {manualState.message && !manualState.ok && (
                <span role="status" className="text-sm text-ec-warn">{manualState.message}</span>
              )}
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
