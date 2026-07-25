"use client";

// WO-272 W2 — one access request with Approve / Reject. Server actions do the
// work + re-check admin; this shows pending + the inline result. Internal
// founder tool, so copy is inline English (not i18n).

import { useFormState, useFormStatus } from "react-dom";
import { approveRequest, rejectRequest, type AdminActionState } from "./actions";

const initial: AdminActionState = {};

export type Row = { id: string; email: string; name: string | null; note: string | null; created_at: string };

function Btn({ label, tone }: { label: string; tone: "ink" | "ghost" }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} aria-busy={pending} className={`ec-btn ${tone === "ink" ? "ec-btn-ink" : "ec-btn-ghost"} px-4`}>
      {pending ? "Working…" : label}
    </button>
  );
}

export function RequestRow({ row }: { row: Row }) {
  const [approveState, approve] = useFormState(approveRequest, initial);
  const [rejectState, reject] = useFormState(rejectRequest, initial);
  const msg = approveState.ok ?? rejectState.ok;
  const err = approveState.error ?? rejectState.error;
  const when = new Date(row.created_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });

  return (
    <li className="rounded-ec-s border border-ec-hair bg-ec-paper p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-medium text-ec-ink">{row.name || "—"}</p>
          <p className="truncate text-sm text-ec-ink-2">{row.email}</p>
          {row.note && <p className="mt-1 text-sm text-ec-ink-3">{row.note}</p>}
          <p className="mt-1 text-xs text-ec-ink-3">{when} IST</p>
        </div>
        <div className="flex shrink-0 gap-2">
          <form action={approve}>
            <input type="hidden" name="id" value={row.id} />
            <Btn label="Approve" tone="ink" />
          </form>
          <form action={reject}>
            <input type="hidden" name="id" value={row.id} />
            <Btn label="Reject" tone="ghost" />
          </form>
        </div>
      </div>
      {msg && <p role="status" className="mt-3 rounded-ec-s bg-ec-brass-tint px-3 py-2 text-sm text-ec-brass-deep">{msg}</p>}
      {err && <p role="alert" className="mt-3 rounded-ec-s bg-ec-danger-t px-3 py-2 text-sm text-ec-danger">{err}</p>}
    </li>
  );
}
