"use client";

import { useFormState, useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import { addCaseByCnr, type ActionResult } from "./actions";
import { Icon } from "@/components/icons";

const initial: ActionResult = { ok: false, message: "" };

function SubmitButton() {
  const { pending } = useFormStatus();
  const t = useTranslations("cases");
  return (
    <button type="submit" disabled={pending} className="ec-btn ec-btn-ink shrink-0">
      <Icon name="plus" className="h-4 w-4" /> {pending ? t("add.fetching") : t("add.cta")}
    </button>
  );
}

export function AddCaseForm() {
  const t = useTranslations("cases");
  const [state, formAction] = useFormState(addCaseByCnr, initial);
  return (
    <form action={formAction} className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ec-ink-3" />
          <input
            name="cnr"
            required
            placeholder={t("add.placeholder")}
            aria-label={t("add.aria")}
            className="input num pl-9 uppercase"
          />
        </div>
        <SubmitButton />
      </div>
      {state.message && (
        <p role="status" className={`rounded-ec-s px-3.5 py-2.5 text-sm ${state.ok ? "bg-ec-success-t text-ec-success" : "bg-ec-warn-t text-ec-warn"}`}>
          {state.message}
        </p>
      )}
    </form>
  );
}
