"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { confirmEmail } from "./actions";

type Opt = { id: string; label: string };

export function ReviewItem({
  email,
  clients,
  matters,
}: {
  email: { id: string; subject: string; from: string; confidence: number | null; client_id: string | null; matter_id: string | null };
  clients: Opt[];
  matters: Opt[];
}) {
  const [clientId, setClientId] = useState(email.client_id ?? "");
  const [matterId, setMatterId] = useState(email.matter_id ?? "");
  const [pending, start] = useTransition();
  const router = useRouter();

  return (
    <li className="space-y-2.5 px-5 py-3.5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-ink">{email.subject || "(no subject)"}</p>
          <p className="truncate text-xs text-ink-faint">{email.from}</p>
        </div>
        <span className="shrink-0 text-xs text-amber-700">
          {email.confidence != null ? `${Math.round(email.confidence * 100)}%` : "low"}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select value={clientId} onChange={(e) => setClientId(e.target.value)} className="input max-w-[11rem] py-1.5 text-xs" aria-label="Assign client">
          <option value="">— client —</option>
          {clients.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
        <select value={matterId} onChange={(e) => setMatterId(e.target.value)} className="input max-w-[11rem] py-1.5 text-xs" aria-label="Assign case">
          <option value="">— case —</option>
          {matters.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
        </select>
        <button
          onClick={() => start(async () => { await confirmEmail(email.id, clientId || null, matterId || null); router.refresh(); })}
          disabled={pending || (!clientId && !matterId)}
          className="btn-primary px-3 py-1.5 text-xs"
        >
          {pending ? "Filing…" : "Confirm & file"}
        </button>
      </div>
    </li>
  );
}
