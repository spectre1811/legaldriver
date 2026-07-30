"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/icons";
import { refreshCasePreview } from "@/app/dashboard/cases/actions";

// WO-289 · "Check for update" on the read-only CNR preview — the untracked twin of the tracked
// matter page's RefreshButton (case-actions.tsx), ported from peshi's Provenance/RefreshButton
// pattern: every case surface, tracked or not, carries an honest "last updated {ts}" (already
// rendered below via caseDetail.source.line) + a working "check for update" action.
export function CheckForUpdateButton({ cnr }: { cnr: string }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const router = useRouter();
  const t = useTranslations("casePreview");

  const onClick = () =>
    start(async () => {
      setMsg(null);
      try {
        const r = await refreshCasePreview(cnr);
        setMsg({ ok: r.ok, text: r.ok ? t("updated") : (r.message || t("updateNoChange")) });
        router.refresh();
      } catch {
        setMsg({ ok: false, text: t("updateFailed") });
      }
    });

  return (
    <div className="flex flex-col items-end gap-1.5">
      <button onClick={onClick} disabled={pending} className="btn-secondary">
        <Icon name="refresh" className={`h-4 w-4 ${pending ? "animate-spin" : ""}`} />
        {pending ? t("checkingForUpdate") : t("checkForUpdate")}
      </button>
      {msg && <span role="status" className={`max-w-xs text-right text-xs ${msg.ok ? "text-ec-ink-3" : "text-red-600"}`}>{msg.text}</span>}
    </div>
  );
}
