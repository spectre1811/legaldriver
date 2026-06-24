"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { runMockIngest } from "./actions";
import { Icon } from "@/components/icons";

export function IngestButton() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState("");
  const router = useRouter();
  return (
    <span className="flex items-center gap-2">
      <button
        onClick={() => start(async () => { const r = await runMockIngest(); setMsg(r.message); router.refresh(); })}
        disabled={pending}
        className="btn-secondary"
      >
        <Icon name="sparkles" className="h-4 w-4" /> {pending ? "Ingesting…" : "Demo ingest"}
      </button>
      {msg && <span className="max-w-xs text-xs text-ink-muted">{msg}</span>}
    </span>
  );
}
