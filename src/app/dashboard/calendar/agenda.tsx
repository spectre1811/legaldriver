"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/icons";
import { deleteCalendarEvent } from "./actions";
import { KIND_LABEL, KIND_STYLE, type Kind } from "./kinds";

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

// Tinted stamp chip for an event kind (V-A: tint bg + deep text, stamp radius).
function KindChip({ kind }: { kind: Kind }) {
  return (
    <span
      className={`inline-block shrink-0 rounded-[3px] px-1.5 py-0.5 font-mono text-[9.5px] font-semibold uppercase tracking-[0.14em] ${KIND_STYLE[kind].chip}`}
    >
      {KIND_LABEL[kind]}
    </span>
  );
}

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
        className="rounded-ec-s p-1 text-ec-ink-3 transition hover:bg-ec-danger-t hover:text-ec-danger"
        title={t("deleteEntry")}
      >
        <Icon name="trash" className="h-3.5 w-3.5" />
      </button>
    );
  }
  return (
    <span className="flex items-center gap-1.5 text-xs">
      {error ? <span className="text-ec-danger">{error}</span> : <span className="text-ec-ink-3">{t("deleteConfirm")}</span>}
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
        className="rounded-ec-s bg-ec-danger-t px-2 py-0.5 font-medium text-ec-danger hover:opacity-80 disabled:opacity-60"
      >
        {pending ? "…" : t("yes")}
      </button>
      <button type="button" onClick={() => setConfirming(false)} className="rounded-ec-s px-2 py-0.5 text-ec-ink-3 hover:text-ec-ink">
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
        <span className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-ec-m bg-ec-paper-3 text-ec-bronze-deep">
          <Icon name="calendar" className="h-5 w-5" />
        </span>
        <h3 className="font-display text-base text-ec-ink">{t("emptyTitle")}</h3>
        <p className="mx-auto mt-1 max-w-xs text-xs text-ec-ink-3">{t("emptyBody")}</p>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-ec-hair">
      {groups.map((g) => (
        <li key={g.date} className="px-5 py-3">
          <div className="mb-2 flex items-baseline gap-2">
            <span className="text-sm font-semibold text-ec-ink">{g.relative}</span>
            <span className="num text-xs text-ec-ink-3">{g.label}</span>
          </div>
          <ul className="space-y-1.5">
            {g.events.map((e) => {
              const body = (
                <>
                  <KindChip kind={e.kind} />
                  <span className="flex-1 truncate font-display text-[13.5px] text-ec-ink">{e.title}</span>
                  {e.meta && <span className="hidden truncate font-mono text-[10px] uppercase tracking-[0.12em] text-ec-ink-3 sm:inline">{e.meta}</span>}
                </>
              );
              return (
                <li key={e.id} className="group flex items-center gap-2.5 text-sm">
                  {e.href ? (
                    <Link href={e.href} className="flex flex-1 items-center gap-2.5 rounded-ec-s py-0.5 hover:text-ec-bronze">
                      {body}
                      <Icon name="external" className="h-3.5 w-3.5 text-ec-ink-3 opacity-0 transition group-hover:opacity-100" />
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
