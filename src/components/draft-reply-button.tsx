"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { draftFromDocument } from "@/app/dashboard/draft/actions";

// Entry point from any document → start a drafting-agent reply and open the console.
export function DraftReplyButton({ documentId, className }: { documentId: string; className?: string }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState("");
  const router = useRouter();
  return (
    <span className="inline-flex items-center gap-2">
      <button
        onClick={() => start(async () => {
          const r = await draftFromDocument(documentId);
          setMsg(r.message);
          if (r.ok && r.draftId) router.push(`/dashboard/draft/${r.draftId}`);
        })}
        disabled={pending}
        className={className ?? "btn-secondary inline-flex items-center gap-1.5 px-3 py-2 text-sm"}
      >
        <Icon name={pending ? "refresh" : "edit"} className={`h-4 w-4 ${pending ? "animate-spin" : ""}`} /> {pending ? "Drafting…" : "Draft a reply"}
      </button>
      {msg && <span className="max-w-xs text-xs text-ink-muted">{msg}</span>}
    </span>
  );
}
