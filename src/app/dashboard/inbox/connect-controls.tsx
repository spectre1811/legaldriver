"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { disconnectGmail, loadEarlierEmails } from "./actions";

export function DisconnectButton() {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <button
      onClick={() => start(async () => { await disconnectGmail(); router.refresh(); })}
      disabled={pending}
      className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-60"
    >
      {pending ? "…" : "Disconnect"}
    </button>
  );
}

export function LoadEarlierButton() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState("");
  const router = useRouter();
  return (
    <span className="flex items-center gap-2">
      <button
        onClick={() => start(async () => { const r = await loadEarlierEmails(); setMsg(r.message); router.refresh(); })}
        disabled={pending}
        className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-60"
      >
        {pending ? "Loading…" : "Load earlier emails"}
      </button>
      {msg && <span className="text-xs text-slate-500">{msg}</span>}
    </span>
  );
}
