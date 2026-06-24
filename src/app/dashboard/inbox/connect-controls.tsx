"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { disconnectGmail } from "./actions";

export function DisconnectButton() {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <button
      onClick={() => start(async () => { await disconnectGmail(); router.refresh(); })}
      disabled={pending}
      className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-60"
    >
      {pending ? "…" : "Disconnect"}
    </button>
  );
}
