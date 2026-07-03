"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { startOnboarding, deleteOnboarding } from "./actions";

export function RunOnboardingButton({ advocateId, label }: { advocateId: string; label: string }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState("");
  const router = useRouter();
  return (
    <div className="flex items-center gap-3">
      <button
        onClick={() => start(async () => { const r = await startOnboarding(advocateId); setMsg(r.message); router.refresh(); })}
        disabled={pending}
        className="btn-primary"
      >
        <Icon name={pending ? "refresh" : "sparkles"} className={`h-4 w-4 ${pending ? "animate-spin" : ""}`} /> {pending ? "Running…" : label}
      </button>
      {msg && <span className="max-w-md text-xs text-ink-muted">{msg}</span>}
    </div>
  );
}

// Undo an onboarding: removes the advocate + their onboarded cases (confirm first).
export function DeleteOnboardingButton({ advocateId, label, confirmText }: { advocateId: string; label: string; confirmText: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <button
      onClick={() => {
        if (!window.confirm(confirmText)) return;
        start(async () => { const r = await deleteOnboarding(advocateId); if (r.message) window.alert(r.message); router.refresh(); });
      }}
      disabled={pending}
      className="text-xs text-ink-muted underline-offset-2 hover:text-red-600 hover:underline disabled:opacity-50"
    >
      {pending ? "Removing…" : label}
    </button>
  );
}
