"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/icons";
import { trackCaseByCnr } from "@/app/dashboard/cases/actions";

// WO-83 · The Track action, presented ON the case preview ("track button on opening the case").
// Tracking a case creates the tenant's matter (via the existing server action) and takes them to
// the full tracked case page — where the AI briefing becomes available. `variant` lets the same
// action render as the header's primary button or the AI-teaser card's inline button.
export function TrackCaseCta({ cnr, variant = "primary" }: { cnr: string; variant?: "primary" | "inline" }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState("");
  const router = useRouter();
  const t = useTranslations("casePreview");
  const onClick = () =>
    start(async () => {
      setMsg("");
      const r = await trackCaseByCnr(cnr);
      if (r.ok && r.matterId) {
        // Land on the tracked matter page (AI briefing, reminders, diary, billing live there).
        router.push(`/dashboard/cases/${r.matterId}`);
        router.refresh();
        return;
      }
      setMsg(r.message);
    });
  return (
    <div className={variant === "primary" ? "flex flex-col items-end gap-1.5" : "flex flex-col gap-1.5"}>
      <button onClick={onClick} disabled={pending} className="btn-primary">
        <Icon name="sparkles" className="h-4 w-4" />
        {pending ? t("tracking") : t("track")}
      </button>
      {msg && <span role="status" className="text-xs text-red-600">{msg}</span>}
    </div>
  );
}
