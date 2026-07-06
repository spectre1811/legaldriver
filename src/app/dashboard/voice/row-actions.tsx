"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/icons";
import { Combobox } from "@/components/combobox";
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
  const t = useTranslations("voice");
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
          title={t("actions.transcribeTitle")}
        >
          <Icon name="sparkles" className="h-3.5 w-3.5" />
          {pending ? t("actions.working") : t("actions.transcribe")}
        </button>
        <button onClick={() => setMode(mode === "manual" ? "none" : "manual")} className="btn-ghost !px-3 !py-1.5 text-xs">
          <Icon name="clip" className="h-3.5 w-3.5" />
          {hasTranscript ? t("actions.editTranscript") : t("actions.enterTranscript")}
        </button>
        <button onClick={() => setMode(mode === "tag" ? "none" : "tag")} className="btn-ghost !px-3 !py-1.5 text-xs">
          {t("actions.refile")}
        </button>
        {msg && <span className="text-xs text-ink-muted">{msg}</span>}
      </div>

      {mode === "manual" && (
        <div className="space-y-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            placeholder={t("actions.transcriptPlaceholder")}
            className="input"
          />
          <button onClick={() => run(() => saveManualTranscript(id, text))} disabled={pending} className="btn-primary !px-3 !py-1.5 text-xs">
            {t("actions.saveTranscript")}
          </button>
        </div>
      )}

      {mode === "tag" && (
        <div className="flex flex-wrap items-center gap-2">
          <Combobox
            label={t("actions.noClientOption")} placeholder={t("actions.noClientOption")}
            options={clients.map((o) => ({ value: o.id, label: o.label }))}
            value={c || null} onChange={(v) => setC(v ?? "")}
            className="min-w-[11rem] max-w-[13rem]"
          />
          <Combobox
            label={t("actions.noCaseOption")} placeholder={t("actions.noCaseOption")}
            options={matters.map((o) => ({ value: o.id, label: o.label }))}
            value={m || null} onChange={(v) => setM(v ?? "")}
            className="min-w-[11rem] max-w-[13rem]"
          />
          <button onClick={() => run(() => tagRecording(id, c || null, m || null))} disabled={pending} className="btn-primary !px-3 !py-1.5 text-xs">
            {t("actions.save")}
          </button>
        </div>
      )}
    </div>
  );
}
