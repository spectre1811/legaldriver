"use client";

import { useFormState, useFormStatus } from "react-dom";
import { addIpAsset, type ActionResult } from "./actions";

const initial: ActionResult = { ok: false, message: "" };

function Submit() {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={pending} className="btn-primary">{pending ? "Saving…" : "Add asset"}</button>;
}

export function IpForm() {
  const [state, action] = useFormState(addIpAsset, initial);
  return (
    <form action={action} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <input name="title" required placeholder="Mark / title, e.g. ACME (word mark)" className="input" aria-label="Title" />
        <select name="type" className="input" aria-label="Type">
          <option value="trademark">Trademark</option>
          <option value="patent">Patent</option>
          <option value="copyright">Copyright</option>
          <option value="design">Design</option>
        </select>
        <input name="registration_no" placeholder="Registration / application no." className="input" aria-label="Registration number" />
        <input name="jurisdiction" placeholder="Jurisdiction, e.g. IN / class 9" className="input" aria-label="Jurisdiction" />
        <div className="sm:col-span-2">
          <label className="label" htmlFor="renewal_date">Renewal date (sets reminders)</label>
          <input id="renewal_date" name="renewal_date" type="date" className="input mt-1.5" />
        </div>
      </div>
      <Submit />
      {state.message && (
        <p role="status" className={`rounded-xl px-3.5 py-2.5 text-sm ${state.ok ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>{state.message}</p>
      )}
    </form>
  );
}
