"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { transcribeRecording, saveManualTranscript, tagRecording } from "./actions";

type Opt = { id: string; label: string };

// Per-recording actions: run STT (gated), enter a transcript by hand (keyless
// fallback), and re-file onto a client/matter.
export function RowActions({
  id,
  clientId,
  matterId,
  hasTranscript,
  clients,
  matters,
}: {
  id: string;
  clientId: string | null;
  matterId: string | null;
  hasTranscript: boolean;
  clients: Opt[];
  matters: Opt[];
}) {
  const [mode, setMode] = useState<"none" | "manual" | "tag">("none");
  const [text, setText] = useState("");
  const [c, setC] = useState(clientId ?? "");
  const [m, setM] = useState(matterId ?? "");
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();

  const run = (fn: () => Promise<{ ok: boolean; message: string }>, closeOnOk = true) =>
    start(async () => {
      const r = await fn();
      setMsg(r.message);
      if (r.ok) { if (closeOnOk) setMode("none"); router.refresh(); }
    });

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => run(() => transcribeRecording(id), false)}
          disabled={pending}
          className="btn-secondary !px-3 !py-1.5 text-xs"
          title="Transcribe via the configured STT provider"
        >
          <Icon name="sparkles" className="h-3.5 w-3.5" />
          {pending ? "Working…" : "Transcribe"}
        </button>
        <button onClick={() => setMode(mode === "manual" ? "none" : "manual")} className="btn-ghost !px-3 !py-1.5 text-xs">
          <Icon name="clip" className="h-3.5 w-3.5" />
          {hasTranscript ? "Edit transcript" : "Enter transcript"}
        </button>
        <button onClick={() => setMode(mode === "tag" ? "none" : "tag")} className="btn-ghost !px-3 !py-1.5 text-xs">
          Re-file
        </button>
        {msg && <span className="text-xs text-ink-muted">{msg}</span>}
      </div>

      {mode === "manual" && (
        <div className="space-y-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            placeholder="Type the transcript… (sensitive — handled as PII)"
            className="input"
          />
          <button onClick={() => run(() => saveManualTranscript(id, text))} disabled={pending} className="btn-primary !px-3 !py-1.5 text-xs">
            Save transcript
          </button>
        </div>
      )}

      {mode === "tag" && (
        <div className="flex flex-wrap items-center gap-2">
          <select value={c} onChange={(e) => setC(e.target.value)} className="input max-w-[12rem]">
            <option value="">— no client —</option>
            {clients.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
          <select value={m} onChange={(e) => setM(e.target.value)} className="input max-w-[12rem]">
            <option value="">— no case —</option>
            {matters.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
          <button onClick={() => run(() => tagRecording(id, c || null, m || null))} disabled={pending} className="btn-primary !px-3 !py-1.5 text-xs">
            Save
          </button>
        </div>
      )}
    </div>
  );
}
