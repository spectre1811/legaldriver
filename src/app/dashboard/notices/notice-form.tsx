"use client";

import { useFormState, useFormStatus } from "react-dom";
import { createNotice, type ActionResult } from "./actions";

const initial: ActionResult = { ok: false, message: "" };

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending}
      className="rounded-md bg-accent px-4 py-2 font-medium text-white hover:bg-blue-800 disabled:opacity-60">
      {pending ? "Creating…" : "Create notice"}
    </button>
  );
}

export function NoticeForm({ matters }: { matters: { id: string; title: string }[] }) {
  const [state, action] = useFormState(createNotice, initial);
  return (
    <form action={action} className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <input name="type" required placeholder="Type, e.g. Legal demand notice"
          className="rounded-md border border-slate-300 px-3 py-2 text-sm" aria-label="Notice type" />
        <input name="response_due" required type="date"
          className="rounded-md border border-slate-300 px-3 py-2 text-sm" aria-label="Response due date" />
        <select name="matter_id" className="rounded-md border border-slate-300 px-3 py-2 text-sm" aria-label="Linked matter">
          <option value="">No linked case</option>
          {matters.map((m) => (
            <option key={m.id} value={m.id}>{m.title}</option>
          ))}
        </select>
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
