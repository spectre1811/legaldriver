"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { disconnectGmail, loadEarlierEmails } from "./actions";

export function DisconnectButton() {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <button onClick={() => start(async () => { await disconnectGmail(); router.refresh(); })} disabled={pending} className="btn-ghost">
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
      <button onClick={() => start(async () => { const r = await loadEarlierEmails(); setMsg(r.message); router.refresh(); })} disabled={pending} className="btn-secondary">
        {pending ? "Loading…" : "Load earlier"}
      </button>
      {msg && <span className="max-w-xs text-xs text-ink-muted">{msg}</span>}
    </span>
  );
}
