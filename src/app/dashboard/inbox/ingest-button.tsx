"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { runMockIngest } from "./actions";

export function IngestButton() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState("");
  const router = useRouter();
  return (
    <div className="flex items-center gap-3">
      <button
        onClick={() => start(async () => { const r = await runMockIngest(); setMsg(r.message); router.refresh(); })}
        disabled={pending}
        className="rounded-md border border-accent px-3 py-1.5 text-sm font-medium text-accent hover:bg-blue-50 disabled:opacity-60"
      >
        {pending ? "Ingesting…" : "Simulate ingest (demo mailbox)"}
      </button>
      {msg && <span className="text-xs text-slate-500">{msg}</span>}
    </div>
  );
}
