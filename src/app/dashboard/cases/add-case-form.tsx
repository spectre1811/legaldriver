"use client";

import { useFormState, useFormStatus } from "react-dom";
import { addCaseByCnr, type ActionResult } from "./actions";

const initial: ActionResult = { ok: false, message: "" };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-accent px-4 py-2 font-medium text-white hover:bg-blue-800 disabled:opacity-60"
    >
      {pending ? "Fetching…" : "Add case"}
    </button>
  );
}

export function AddCaseForm() {
  const [state, formAction] = useFormState(addCaseByCnr, initial);
  return (
    <form action={formAction} className="space-y-3">
      <div className="flex gap-2">
        <input
          name="cnr"
          required
          placeholder="CNR number, e.g. MHPU010012342020"
          aria-label="CNR number"
          className="flex-1 rounded-md border border-slate-300 px-3 py-2 font-mono text-sm uppercase"
        />
        <SubmitButton />
      </div>
      {state.message && (
        <p
          role="status"
          className={`rounded-md px-3 py-2 text-sm ${
            state.ok ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-800"
          }`}
        >
          {state.message}
        </p>
      )}
    </form>
  );
}
