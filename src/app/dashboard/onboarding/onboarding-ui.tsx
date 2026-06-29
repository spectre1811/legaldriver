"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { startOnboarding } from "./actions";

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
