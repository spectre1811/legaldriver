"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/icons";
import { setGmailQuery } from "./actions";

// WO-29 W1b · edit the connection's optional Gmail search scope from the inbox card. Empty = ingest
// all (minus the always-on spam/promotions hygiene). Uses Gmail search syntax (from:, label:, …).
// WO-335 · restyled from a <details> disclosure to the Chambers reference's inline click-to-edit
// row (pencil → input, save on blur/Enter) — same `setGmailQuery` action, chrome only changed.
export function GmailQueryForm({ initial }: { initial: string }) {
  const t = useTranslations("inbox.scope");
  const td = useTranslations("dashboard.inbox");
  const [editing, setEditing] = useState(false);
  const [query, setQuery] = useState(initial);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  function save() {
    setEditing(false);
    if (query.trim() === initial.trim()) return; // nothing changed — skip the round-trip
    start(async () => {
      const r = await setGmailQuery(query);
      setMsg({ ok: r.ok, text: r.message });
      router.refresh();
    });
  }

  return (
    <div className="mt-1.5">
      {editing ? (
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
          autoFocus
          placeholder={t("placeholder")}
          aria-label={t("title")}
          disabled={pending}
          className="num w-full max-w-md rounded border border-ec-line bg-ec-paper px-2 py-1 font-mono text-[11.5px] text-ec-ink outline-none focus:border-ec-bronze"
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="num inline-flex max-w-full items-center gap-1.5 truncate text-left font-mono text-[11.5px] text-ec-muted-ink hover:text-ec-bronze"
        >
          <Icon name="edit" className="h-3 w-3 shrink-0" />
          <span className="truncate">{query || td("scope.anyMail")}</span>
        </button>
      )}
      <p className="mt-1 text-[11px] text-ec-muted-ink">{t("hygieneNote")}</p>
      {msg && <p className={`text-[11px] ${msg.ok ? "text-ec-success" : "text-ec-warn"}`}>{msg.text}</p>}
    </div>
  );
}
