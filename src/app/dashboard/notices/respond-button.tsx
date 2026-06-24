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
      className="btn-secondary px-2.5 py-1.5 text-xs"
    >
      {pending ? "…" : "Mark responded"}
    </button>
  );
}
