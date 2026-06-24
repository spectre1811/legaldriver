"use client";

import { useFormState, useFormStatus } from "react-dom";
import { addAdvocate, type ActionResult } from "./actions";

const initial: ActionResult = { ok: false, message: "" };

function Submit() {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={pending} className="btn-primary">{pending ? "Saving…" : "Add advocate"}</button>;
}

export function AdvocateForm() {
  const [state, action] = useFormState(addAdvocate, initial);
  return (
    <form action={action} className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <input name="name" required placeholder="Advocate name" className="input" aria-label="Advocate name" />
        <input name="bar_registration_number" placeholder="Bar no., e.g. MAH/1234/1982" className="input font-mono uppercase" aria-label="Bar registration number" />
        <input name="state_code" placeholder="State, e.g. MH" className="input uppercase" aria-label="State code" />
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
