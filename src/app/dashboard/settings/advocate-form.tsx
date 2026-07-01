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
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <input name="name" required placeholder="Advocate name" className="input" aria-label="Advocate name" />
        <input name="bar_registration_number" placeholder="Bar no., e.g. MAH/1234/1982" className="input font-mono uppercase" aria-label="Bar registration number" />
        <input name="bar_code" placeholder="eCourts bar code, e.g. 1946" className="input font-mono" aria-label="eCourts numeric bar code" inputMode="numeric" />
        <input name="state_code" placeholder="State, e.g. GJ" className="input uppercase" aria-label="State code" />
      </div>
      <p className="text-xs text-ink-faint">The numeric <strong>eCourts bar code</strong> gives an exact case-roster pull on onboarding; without it we resolve by name.</p>
      <Submit />
      {state.message && (
        <p role="status" className={`rounded-xl px-3.5 py-2.5 text-sm ${state.ok ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>
          {state.message}
        </p>
      )}
    </form>
  );
}
