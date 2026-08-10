"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/icons";
import { disconnectGmail, loadEarlierEmails } from "./actions";

export function DisconnectButton() {
  const t = useTranslations("inbox");
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <button
      onClick={() => start(async () => { await disconnectGmail(); router.refresh(); })}
      disabled={pending}
      className="ec-btn ec-btn-ghost text-[12.5px]"
    >
      {pending ? "…" : t("disconnect")}
    </button>
  );
}

// A manual pull of recent mail through the ingest pipeline (dedupes against already-ingested).
// Presented as "Sync now" on the inbox sync card (WO-170). WO-335: restyled to the Chambers
// reference's tri-state pill (Sync now / Syncing… spinner / a momentary "Up to date" check) —
// the transient "synced" flash is new local UI state only, the underlying action is unchanged.
export function SyncNowButton() {
  const t = useTranslations("inbox");
  const td = useTranslations("dashboard.inbox");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState("");
  const [justSynced, setJustSynced] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (!justSynced) return;
    const id = setTimeout(() => setJustSynced(false), 2000);
    return () => clearTimeout(id);
  }, [justSynced]);

  return (
    <span className="flex flex-wrap items-center gap-2">
      <button
        onClick={() =>
          start(async () => {
            const r = await loadEarlierEmails();
            setMsg(r.message);
            setJustSynced(r.ok);
            router.refresh();
          })
        }
        disabled={pending}
        className="ec-btn ec-btn-ghost text-[12.5px]"
      >
        {justSynced ? (
          <Icon name="check" className="h-3.5 w-3.5 text-ec-success" />
        ) : (
          <Icon name="refresh" className={`h-3.5 w-3.5 ${pending ? "animate-spin" : ""}`} />
        )}
        {pending ? t("sync.syncing") : justSynced ? td("upToDate") : t("sync.now")}
      </button>
      {msg && !justSynced && <span className="max-w-xs text-xs text-ec-muted-ink">{msg}</span>}
    </span>
  );
}
