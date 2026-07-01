"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { trackCaseByCnr } from "@/app/dashboard/cases/actions";

// Track a case by CNR from a caseload/history browse → opens the tracked matter.
export function TrackCaseButton({ cnr }: { cnr: string }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState("");
  const router = useRouter();
  return (
    <span className="inline-flex items-center gap-1.5">
      <button
        onClick={() => start(async () => { const r = await trackCaseByCnr(cnr); setMsg(r.message); if (r.ok && r.matterId) router.push(`/dashboard/cases/${r.matterId}`); })}
        disabled={pending}
        className="rounded-lg border border-line px-2 py-0.5 text-xs text-brand-600 hover:bg-brand-50 disabled:opacity-50"
      >
        {pending ? "…" : "Track"}
      </button>
      {msg && !pending && <span className="text-[0.7rem] text-ink-faint">{msg}</span>}
    </span>
  );
}
