"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/icons";
import { disconnectGmail, loadEarlierEmails } from "./actions";

export function DisconnectButton() {
  const t = useTranslations("inbox");
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <button onClick={() => start(async () => { await disconnectGmail(); router.refresh(); })} disabled={pending} className="btn-ghost">
      {pending ? "…" : t("disconnect")}
    </button>
  );
}

// A manual pull of recent mail through the ingest pipeline (dedupes against already-ingested).
// Presented as "Sync now" on the inbox sync card (WO-170).
export function SyncNowButton() {
  const t = useTranslations("inbox");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState("");
  const router = useRouter();
  return (
    <span className="flex items-center gap-2">
      <button onClick={() => start(async () => { const r = await loadEarlierEmails(); setMsg(r.message); router.refresh(); })} disabled={pending} className="btn-secondary">
        <Icon name="refresh" className={`h-4 w-4 ${pending ? "animate-spin" : ""}`} /> {pending ? t("sync.syncing") : t("sync.now")}
      </button>
      {msg && <span className="max-w-xs text-xs text-ink-muted">{msg}</span>}
    </span>
  );
}
