"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui";
import { Icon } from "@/components/icons";
import { deleteCalendarEvent } from "./actions";
import { KIND_LABEL, KIND_TONE, type Kind } from "./kinds";

export type AgendaEvent = {
  id: string;
  date: string; // YYYY-MM-DD
  title: string;
  kind: Kind;
  href: string | null;
  meta?: string;
  deletable: boolean; // true only for manual calendar_event rows
};

type Group = { date: string; label: string; relative: string; events: AgendaEvent[] };

function DeleteControl({ id, title }: { id: string; title: string }) {
  const t = useTranslations("calendar");
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        aria-label={t("deleteAria", { title })}
        className="rounded-md p-1 text-ink-faint transition hover:bg-rose-50 hover:text-rose-600"
        title={t("deleteEntry")}
      >
        <Icon name="alert" className="h-3.5 w-3.5" />
      </button>
    );
  }
  return (
    <span className="flex items-center gap-1.5 text-xs">
      {error ? (
        <span className="text-amber-700">{error}</span>
      ) : (
        <span className="text-ink-muted">{t("deleteConfirm")}</span>
      )}
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const res = await deleteCalendarEvent(id);
            if (!res.ok) {
              setError(res.message);
              setConfirming(false);
            }
          })
        }
        className="rounded-md bg-rose-50 px-2 py-0.5 font-medium text-rose-700 hover:bg-rose-100 disabled:opacity-60"
      >
        {pending ? "…" : t("yes")}
      </button>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        className="rounded-md px-2 py-0.5 text-ink-muted hover:text-ink"
      >
        {t("no")}
      </button>
    </span>
  );
}

export function Agenda({ groups }: { groups: Group[] }) {
  const t = useTranslations("calendar");
  if (!groups.length) {
    return (
      <div className="px-5 py-12 text-center">
        <span className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-50 text-brand-500">
          <Icon name="calendar" className="h-5 w-5" />
        </span>
        <h3 className="text-sm font-medium">{t("emptyTitle")}</h3>
        <p className="mx-auto mt-1 max-w-xs text-xs text-ink-muted">
          {t("emptyBody")}
        </p>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-line">
      {groups.map((g) => (
        <li key={g.date} className="px-5 py-3">
          <div className="mb-2 flex items-baseline gap-2">
            <span className="text-sm font-semibold text-ink">{g.relative}</span>
            <span className="text-xs text-ink-faint">{g.label}</span>
          </div>
          <ul className="space-y-1.5">
            {g.events.map((e) => {
              const body = (
                <>
                  <Badge tone={KIND_TONE[e.kind]}>{KIND_LABEL[e.kind]}</Badge>
                  <span className="flex-1 truncate font-medium text-ink">{e.title}</span>
                  {e.meta && <span className="hidden truncate text-xs text-ink-muted sm:inline">{e.meta}</span>}
                </>
              );
              return (
                <li key={e.id} className="group flex items-center gap-2.5 text-sm">
                  {e.href ? (
                    <Link
                      href={e.href}
                      className="flex flex-1 items-center gap-2.5 rounded-md py-0.5 hover:text-brand-600"
                    >
                      {body}
                      <Icon name="external" className="h-3.5 w-3.5 text-ink-faint opacity-0 transition group-hover:opacity-100" />
                    </Link>
                  ) : (
                    <span className="flex flex-1 items-center gap-2.5 py-0.5">{body}</span>
                  )}
                  {e.deletable && <DeleteControl id={e.id} title={e.title} />}
                </li>
              );
            })}
          </ul>
        </li>
      ))}
    </ul>
  );
}
