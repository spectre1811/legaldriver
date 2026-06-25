"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";

type Result = { ok: boolean; message: string };

// Two-step inline confirm-delete. Pass a server-action reference + the id; on
// success it redirects (redirectTo) or refreshes. No window.confirm.
export function ConfirmDelete({
  action,
  id,
  label = "Delete",
  confirmLabel = "Confirm delete",
  note,
  redirectTo,
  size = "sm",
}: {
  action: (id: string) => Promise<Result>;
  id: string;
  label?: string;
  confirmLabel?: string;
  note?: string;
  redirectTo?: string;
  size?: "sm" | "md";
}) {
  const [armed, setArmed] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const pad = size === "md" ? "px-3 py-1.5 text-sm" : "px-2 py-1 text-xs";

  if (!armed) {
    return (
      <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); setArmed(true); }} className={`inline-flex items-center gap-1 rounded-md ${pad} text-red-600 hover:bg-red-50`}>
        <Icon name="alert" className="h-3.5 w-3.5" /> {label}
      </button>
    );
  }
  return (
    <span className="inline-flex flex-col items-end gap-1" onClick={(e) => e.preventDefault()}>
      {note && <span className="text-[11px] text-ink-faint">{note}</span>}
      <span className="inline-flex items-center gap-1.5">
        <button
          disabled={pending}
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); setErr(null); start(async () => { const r = await action(id); if (r.ok) { if (redirectTo) router.push(redirectTo); else router.refresh(); } else setErr(r.message); }); }}
          className={`rounded-md ${pad} bg-red-600 text-white hover:bg-red-700`}
        >
          {pending ? "…" : confirmLabel}
        </button>
        <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); setArmed(false); }} className={`rounded-md ${pad} text-ink-muted hover:bg-paper`}>Cancel</button>
      </span>
      {err && <span className="text-[11px] text-red-600">{err}</span>}
    </span>
  );
}
