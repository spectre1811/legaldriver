"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { markResponded } from "./actions";

export function RespondButton({ noticeId }: { noticeId: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <button
      onClick={() => start(async () => { await markResponded(noticeId); router.refresh(); })}
      disabled={pending}
      className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-100 disabled:opacity-60"
    >
      {pending ? "…" : "Mark responded"}
    </button>
  );
}
