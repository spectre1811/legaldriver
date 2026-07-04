"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/icons";
import { setGmailQuery } from "./actions";

// WO-29 W1b · edit the connection's optional Gmail search scope from the inbox card. Empty = ingest
// all (minus the always-on spam/promotions hygiene). Uses Gmail search syntax (from:, label:, …).
export function GmailQueryForm({ initial }: { initial: string }) {
  const t = useTranslations("inbox.scope");
  const [query, setQuery] = useState(initial);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <details open={open || !!initial} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)} className="rounded-xl border border-line bg-paper/50 p-4">
      <summary className="flex cursor-pointer items-center gap-1.5 text-sm font-medium text-ink">
        <Icon name="search" className="h-4 w-4 text-ink-faint" /> {t("title")}
      </summary>
      <div className="mt-3 space-y-2">
        <p className="text-xs text-ink-faint">{t("help")}</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("placeholder")}
            aria-label={t("title")}
            className="input flex-1 font-mono text-xs"
          />
          <button
            type="button"
            disabled={pending}
            onClick={() => start(async () => { const r = await setGmailQuery(query); setMsg({ ok: r.ok, text: r.message }); router.refresh(); })}
            className="btn-secondary shrink-0"
          >
            {pending ? t("saving") : t("save")}
          </button>
        </div>
        {msg && <p className={`text-xs ${msg.ok ? "text-emerald-700" : "text-amber-700"}`}>{msg.text}</p>}
        <p className="text-[11px] text-ink-faint">{t("hygieneNote")}</p>
      </div>
    </details>
  );
}
