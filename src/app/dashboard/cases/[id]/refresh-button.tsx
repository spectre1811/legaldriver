"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { refreshCase } from "../actions";

export function RefreshButton({ matterId }: { matterId: string }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string>("");
  const router = useRouter();

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={() =>
          start(async () => {
            const r = await refreshCase(matterId);
            setMsg(r.message);
            router.refresh();
          })
        }
        disabled={pending}
        className="rounded-md border border-accent px-3 py-1.5 text-sm font-medium text-accent hover:bg-blue-50 disabled:opacity-60"
      >
        {pending ? "Refreshing…" : "Refresh from source"}
      </button>
      {msg && <span className="text-xs text-slate-500">{msg}</span>}
    </div>
  );
}
