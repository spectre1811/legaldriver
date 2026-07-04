"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/icons";
import { askAgentAction } from "./actions";

// Composer pinned at the bottom of the agent panel. Carries the matter/client
// context (and active thread) through as hidden fields so a scoped deep-link like
// /dashboard/assistant/ask?matter=<id> keeps that grounding on every turn.
export function Chat({
  threadId,
  matterId,
  clientId,
}: {
  threadId?: string | null;
  matterId?: string | null;
  clientId?: string | null;
}) {
  const t = useTranslations("copilot");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLFormElement>(null);
  const router = useRouter();

  function submit(form: HTMLFormElement) {
    const fd = new FormData(form);
    setError(null);
    start(async () => {
      const r = await askAgentAction(fd);
      if (!r.ok) {
        setError(r.message);
        return;
      }
      form.reset();
      router.push(`/dashboard/assistant/ask?thread=${r.threadId}`);
      router.refresh();
    });
  }

  return (
    <div className="border-t border-line px-5 py-4">
      <form
        ref={ref}
        onSubmit={(e) => {
          e.preventDefault();
          submit(e.currentTarget);
        }}
        className="space-y-2"
      >
        {threadId && <input type="hidden" name="threadId" value={threadId} />}
        {matterId && <input type="hidden" name="matterId" value={matterId} />}
        {clientId && <input type="hidden" name="clientId" value={clientId} />}
        <div className="flex items-end gap-2">
          <textarea
            name="question"
            required
            rows={2}
            disabled={pending}
            placeholder={t("placeholder")}
            aria-label={t("askAria")}
            className="input min-h-[2.75rem] flex-1 resize-y"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                if (e.currentTarget.form) submit(e.currentTarget.form);
              }
            }}
          />
          <button disabled={pending} className="btn-primary shrink-0">
            {pending ? (
              t("thinking")
            ) : (
              <span className="flex items-center gap-1.5">
                <Icon name="sparkles" className="h-4 w-4" /> {t("ask")}
              </span>
            )}
          </button>
        </div>
        {pending && <p className="text-xs text-ink-faint">{t("thinkingSources")}</p>}
        {error && <p className="text-xs text-red-600">{error}</p>}
      </form>
    </div>
  );
}
