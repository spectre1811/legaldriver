"use client";

import { useFormState, useFormStatus } from "react-dom";
import { addAdvocate, type ActionResult } from "./actions";

const initial: ActionResult = { ok: false, message: "" };

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-accent px-4 py-2 font-medium text-white hover:bg-blue-800 disabled:opacity-60"
    >
      {pending ? "Saving…" : "Add advocate"}
    </button>
  );
}

export function AdvocateForm() {
  const [state, action] = useFormState(addAdvocate, initial);
  return (
    <form action={action} className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <input name="name" required placeholder="Advocate name"
          className="rounded-md border border-slate-300 px-3 py-2 text-sm" aria-label="Advocate name" />
        <input name="bar_registration_number" placeholder="Bar no., e.g. MAH/1234/1982"
          className="rounded-md border border-slate-300 px-3 py-2 font-mono text-sm uppercase" aria-label="Bar registration number" />
        <input name="state_code" placeholder="State code, e.g. MH"
          className="rounded-md border border-slate-300 px-3 py-2 text-sm uppercase" aria-label="State code" />
      </div>
      <Submit />
      {state.message && (
        <p role="status" className={`rounded-md px-3 py-2 text-sm ${state.ok ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-800"}`}>
          {state.message}
        </p>
      )}
    </form>
  );
}
