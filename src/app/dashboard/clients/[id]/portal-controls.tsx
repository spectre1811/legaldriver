"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { inviteToPortal, revokePortal, sendFirmMessage } from "./actions";
import { Icon } from "@/components/icons";

export function PortalInvite({ clientId, portalUserId }: { clientId: string; portalUserId: string | null }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState("");
  const ref = useRef<HTMLFormElement>(null);
  const router = useRouter();

  if (portalUserId) {
    return (
      <div className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-sm text-emerald-700"><Icon name="check" className="h-4 w-4" /> Portal access is active for this client.</p>
        <button
          onClick={() => start(async () => { const r = await revokePortal(portalUserId, clientId); setMsg(r.message); router.refresh(); })}
          disabled={pending} className="btn-ghost text-sm text-red-600">{pending ? "…" : "Revoke"}</button>
      </div>
    );
  }
  return (
    <form ref={ref} onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); start(async () => { const r = await inviteToPortal(clientId, fd); setMsg(r.message); if (r.ok) { ref.current?.reset(); router.refresh(); } }); }} className="space-y-2">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[12rem] flex-1"><label className="label">Client email</label><input name="email" type="email" required className="input mt-1" placeholder="client@company.in" /></div>
        <div><label className="label">Set password</label><input name="password" type="text" required minLength={8} className="input mt-1" placeholder="min 8 chars" /></div>
        <button disabled={pending} className="btn-primary">{pending ? "Creating…" : "Grant portal access"}</button>
      </div>
      {msg && <p className="text-xs text-ink-muted">{msg}</p>}
    </form>
  );
}

export function FirmComposer({ clientId }: { clientId: string }) {
  const [pending, start] = useTransition();
  const ref = useRef<HTMLFormElement>(null);
  const router = useRouter();
  return (
    <form ref={ref} onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); start(async () => { await sendFirmMessage(clientId, fd); ref.current?.reset(); router.refresh(); }); }} className="flex items-center gap-2">
      <input name="body" required placeholder="Reply to the client…" className="input flex-1" aria-label="Message" />
      <button disabled={pending} className="btn-primary shrink-0">{pending ? "…" : "Send"}</button>
    </form>
  );
}
