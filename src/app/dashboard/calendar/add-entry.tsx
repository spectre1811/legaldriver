"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { addCalendarEntry, type ActionResult } from "./actions";
import { Icon } from "@/components/icons";

const initial: ActionResult = { ok: false, message: "" };

function Submit() {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={pending} className="btn-primary">{pending ? "Adding…" : "Add to calendar"}</button>;
}

export function AddEntry({ matters }: { matters: { id: string; title: string }[] }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useFormState(addCalendarEntry, initial);

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="btn-secondary">
        <Icon name="plus" className="h-4 w-4" /> Add entry
      </button>
    );
  }
  return (
    <form action={action} className="card absolute right-0 top-12 z-10 w-80 space-y-3 p-4 shadow-lift">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">New calendar entry</h3>
        <button type="button" onClick={() => setOpen(false)} className="text-ink-faint hover:text-ink">✕</button>
      </div>
      <input name="title" required placeholder="Title (e.g. Client meeting)" className="input" aria-label="Title" />
      <div className="grid grid-cols-2 gap-2">
        <input name="event_date" type="date" required className="input" aria-label="Date" />
        <select name="kind" className="input" aria-label="Kind">
          <option value="event">Event</option>
          <option value="meeting">Meeting</option>
          <option value="filing">Filing</option>
          <option value="reminder">Reminder</option>
          <option value="deadline">Deadline</option>
        </select>
      </div>
      <select name="matter_id" className="input" aria-label="Linked case">
        <option value="">No linked case</option>
        {matters.map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}
      </select>
      <Submit />
      {state.message && (
        <p role="status" className={`rounded-lg px-3 py-2 text-xs ${state.ok ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>
          {state.message}
        </p>
      )}
    </form>
  );
}
