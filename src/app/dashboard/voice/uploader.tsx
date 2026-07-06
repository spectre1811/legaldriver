"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/icons";
import { Combobox } from "@/components/combobox";
import { uploadRecording } from "./actions";

type Opt = { id: string; label: string };

// Manual audio upload with a REQUIRED consent checkbox. Audio goes to the
// private bucket; consent is enforced again server-side before anything stores.
export function VoiceUploader({ clients }: { clients: Opt[] }) {
  const t = useTranslations("voice");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState("");
  const [consent, setConsent] = useState(false);
  const [clientId, setClientId] = useState<string | null>(null);
  const ref = useRef<HTMLFormElement>(null);
  const router = useRouter();

  return (
    <form
      ref={ref}
      onSubmit={(e) => {
        e.preventDefault();
        if (!consent) { setMsg(t("uploader.consentRequired")); return; }
        const fd = new FormData(e.currentTarget);
        start(async () => {
          const r = await uploadRecording(fd);
          setMsg(r.message);
          if (r.ok) { ref.current?.reset(); setConsent(false); setClientId(null); router.refresh(); }
        });
      }}
      className="space-y-3"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="label">{t("uploader.audioFile")}</span>
          <input name="file" type="file" accept="audio/*" required className="input mt-1.5 file:mr-3 file:rounded-lg file:border-0 file:bg-paper file:px-3 file:py-1 file:text-sm" />
        </label>
        <label className="block">
          <span className="label">{t("uploader.callerNumber")}</span>
          <input name="from_number" type="tel" placeholder="+91…" className="input mt-1.5" />
        </label>
      </div>

      <div className="block">
        <span className="label">{t("uploader.tagToClient")}</span>
        {/* Combobox is controlled; a hidden input carries the value into the submitted FormData. */}
        <input type="hidden" name="client_id" value={clientId ?? ""} />
        <div className="mt-1.5">
          <Combobox
            label={t("uploader.tagToClient")} placeholder={t("uploader.unfiledOption")}
            options={clients.map((c) => ({ value: c.id, label: c.label }))}
            value={clientId} onChange={setClientId}
          />
        </div>
      </div>

      <label className="flex items-start gap-2.5 rounded-xl border border-line bg-paper p-3 text-sm">
        <input
          name="consent_disclosed"
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 accent-brand-600"
        />
        <span className="text-ink-muted">
          {t("uploader.consentLabel")}
        </span>
      </label>

      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending || !consent} className="btn-primary">
          <Icon name="upload" className="h-4 w-4" />
          {pending ? t("uploader.uploading") : t("uploader.submit")}
        </button>
        {msg && <span className="text-xs text-ink-muted">{msg}</span>}
      </div>
    </form>
  );
}
