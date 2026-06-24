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
    <li className="space-y-2 px-4 py-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-ink">{email.subject || "(no subject)"}</p>
          <p className="text-xs text-slate-500">{email.from}</p>
        </div>
        <span className="text-xs text-amber-700">
          {email.confidence != null ? `${Math.round(email.confidence * 100)}% confidence` : "low confidence"}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select value={clientId} onChange={(e) => setClientId(e.target.value)}
          className="rounded-md border border-slate-300 px-2 py-1 text-xs" aria-label="Assign client">
          <option value="">— client —</option>
          {clients.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
        <select value={matterId} onChange={(e) => setMatterId(e.target.value)}
          className="rounded-md border border-slate-300 px-2 py-1 text-xs" aria-label="Assign matter">
          <option value="">— matter —</option>
          {matters.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
        </select>
        <button
          onClick={() => start(async () => {
            await confirmEmail(email.id, clientId || null, matterId || null);
            router.refresh();
          })}
          disabled={pending || (!clientId && !matterId)}
          className="rounded-md bg-accent px-3 py-1 text-xs font-medium text-white hover:bg-blue-800 disabled:opacity-50"
        >
          {pending ? "Filing…" : "Confirm & file"}
        </button>
      </div>
    </li>
  );
}
