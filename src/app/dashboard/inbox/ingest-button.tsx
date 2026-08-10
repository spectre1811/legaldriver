"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { runMockIngest } from "./actions";
import { Icon } from "@/components/icons";

export function IngestButton() {
  const td = useTranslations("dashboard.inbox");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState("");
  const router = useRouter();
  return (
    <span className="flex items-center gap-2">
      <button
        onClick={() => start(async () => { const r = await runMockIngest(); setMsg(r.message); router.refresh(); })}
        disabled={pending}
        className="ec-btn ec-btn-ghost text-[12.5px]"
      >
        <Icon name="sparkles" className="h-3.5 w-3.5" /> {pending ? td("ingesting") : td("demoIngest")}
      </button>
      {msg && <span className="max-w-xs text-xs text-ec-muted-ink">{msg}</span>}
    </span>
  );
}
