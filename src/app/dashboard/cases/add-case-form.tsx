"use client";

import { useFormState, useFormStatus } from "react-dom";
import { addCaseByCnr, type ActionResult } from "./actions";
import { Icon } from "@/components/icons";

const initial: ActionResult = { ok: false, message: "" };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary shrink-0">
      <Icon name="plus" className="h-4 w-4" /> {pending ? "Fetching…" : "Add case"}
    </button>
  );
}

export function AddCaseForm() {
  const [state, formAction] = useFormState(addCaseByCnr, initial);
  return (
    <form action={formAction} className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
          <input
            name="cnr"
            required
            placeholder="Add a case by CNR — e.g. MHPU010012342022"
            aria-label="CNR number"
            className="input pl-9 font-mono uppercase"
          />
        </div>
        <SubmitButton />
      </div>
      {state.message && (
        <p role="status" className={`rounded-xl px-3.5 py-2.5 text-sm ${state.ok ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>
          {state.message}
        </p>
      )}
    </form>
  );
}
