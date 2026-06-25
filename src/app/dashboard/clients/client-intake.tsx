"use client";

import { useState, useTransition } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { addClient, runConflictCheck, type IntakeResult } from "./actions";
import { type ConflictHit } from "@/lib/conflict";
import { Icon } from "@/components/icons";

const initial: IntakeResult = { ok: false, message: "" };

function Submit({ ack }: { ack: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary">
      {pending ? "Adding…" : ack ? "Confirm & add client" : "Add client"}
    </button>
  );
}

export function ClientIntake({ practiceAreas }: { practiceAreas: { id: string; name: string }[] }) {
  const [state, action] = useFormState(addClient, initial);
  const [name, setName] = useState("");
  const [live, setLive] = useState<ConflictHit[] | null>(null);
  const [checking, startCheck] = useTransition();
  const router = useRouter();

  const conflicts = state.conflicts ?? live ?? [];
  const showAck = (state.conflicts?.length ?? 0) > 0;

  if (state.ok) {
    // refresh list after a successful add
    router.refresh();
  }

  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="name">Client / party name</label>
          <div className="mt-1.5 flex gap-2">
            <input
              id="name" name="name" required value={name}
              onChange={(e) => { setName(e.target.value); setLive(null); }}
              onBlur={() => name.trim().length > 2 && startCheck(async () => setLive(await runConflictCheck(name)))}
              placeholder="e.g. Acme Corp" className="input"
            />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="type">Type</label>
          <select id="type" name="type" className="input mt-1.5">
            <option value="individual">Individual</option>
            <option value="org">Organisation</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input id="email" name="email" type="email" className="input mt-1.5" placeholder="contact@client.in" />
        </div>
        <div>
          <label className="label" htmlFor="phone">Phone</label>
          <input id="phone" name="phone" className="input mt-1.5" placeholder="+91…" />
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="practice_area_id">Practice area</label>
          <select id="practice_area_id" name="practice_area_id" className="input mt-1.5">
            <option value="">—</option>
            {practiceAreas.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
      </div>

      {(checking || conflicts.length > 0) && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="flex items-center gap-2 text-sm font-medium text-amber-800">
            <Icon name="alert" className="h-4 w-4" />
            {checking ? "Checking for conflicts…" : `Possible conflict${conflicts.length > 1 ? "s" : ""} of interest`}
          </p>
          {conflicts.length > 0 && (
            <ul className="mt-2 space-y-1 text-sm text-amber-800">
              {conflicts.map((c, i) => (
                <li key={i} className="flex items-center justify-between">
                  <span>{c.name} <span className="text-amber-600">· {c.where}</span></span>
                  <span className="text-xs">{Math.round(c.score * 100)}% match</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {showAck && <input type="hidden" name="ack_conflicts" value="1" />}

      <div className="flex items-center gap-3">
        <Submit ack={showAck} />
        {state.message && !state.ok && !showAck && <span className="text-sm text-amber-700">{state.message}</span>}
        {state.ok && <span className="text-sm text-emerald-700">{state.message}</span>}
      </div>
    </form>
  );
}
