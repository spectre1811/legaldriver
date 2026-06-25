"use client";

import { useState } from "react";
import { Icon } from "@/components/icons";

// Renders the AI-drafted reply to an inbound client message. The AI NEVER sends —
// the advocate reviews this draft and sends it from the composer. Copy lifts it
// into the clipboard for now (composer prefill is a follow-up once WhatsApp is live).
export function SuggestedReply({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mt-2 rounded-lg border border-brand-100 bg-brand-50/60 px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-xs font-medium text-brand-700">
          <Icon name="sparkles" className="h-3.5 w-3.5" /> Suggested reply — review before sending
        </span>
        <button
          onClick={() => { navigator.clipboard?.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
          className="flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700"
        >
          <Icon name={copied ? "check" : "clip"} className="h-3.5 w-3.5" /> {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <p className="mt-1 text-sm text-ink">{text}</p>
      <p className="mt-1 text-[11px] text-ink-faint">AI draft, grounded in this case — not sent automatically. Verify before sending.</p>
    </div>
  );
}
