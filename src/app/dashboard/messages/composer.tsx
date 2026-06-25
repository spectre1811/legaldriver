"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { sendMessage } from "./actions";
import { Icon } from "@/components/icons";

// Outbound message composer. WhatsApp only for now. On the mock provider this
// just records the row; on a live BSP it actually sends.
export function Composer() {
  const [to, setTo] = useState("");
  const [body, setBody] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  function submit() {
    setMsg(null);
    start(async () => {
      const r = await sendMessage(to, "whatsapp", body);
      setMsg({ ok: r.ok, text: r.message });
      if (r.ok) {
        setBody("");
        router.refresh();
      }
    });
  }

  return (
    <div className="card space-y-3 p-5">
      <div className="flex items-center gap-2 text-sm font-medium text-ink">
        <Icon name="inbox" className="h-4 w-4 text-brand-500" /> New WhatsApp message
      </div>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,16rem)_1fr]">
        <input
          value={to}
          onChange={(e) => setTo(e.target.value)}
          placeholder="Recipient number (e.g. 919876543210)"
          className="input"
          inputMode="tel"
          disabled={pending}
        />
        <input
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !pending) submit(); }}
          placeholder="Message…"
          className="input"
          disabled={pending}
        />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={submit} disabled={pending || !to.trim() || !body.trim()} className="btn-primary">
          <Icon name="external" className="h-4 w-4" /> {pending ? "Sending…" : "Send"}
        </button>
        {msg && <span className={`text-xs ${msg.ok ? "text-emerald-600" : "text-amber-700"}`}>{msg.text}</span>}
      </div>
      <p className="text-xs text-ink-faint">
        Messages are logged to the matter; AI routing is assistive. Send only from the firm&apos;s registered
        Business number, and only with the recipient&apos;s consent (DPDP).
      </p>
    </div>
  );
}
