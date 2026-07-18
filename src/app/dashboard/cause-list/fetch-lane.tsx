"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/icons";
import { outcomeFromStatus, nextFromOutcome, type BoardState } from "@/lib/court/causelist-state";

// WO-205 W3 · The on-demand fetch island. Mounts ONLY when the server resolved `state === "fetching"`
// (a District held-miss with the live lane on). It enqueues the fetch, polls, and on `found` calls
// router.refresh() so the SERVER board re-reads and renders the now-held rows — no board-render logic
// is duplicated client-side. Non-blocking: this is a sibling of the pickers, never a modal, so the
// cascade stays fully usable while a board retrieves.

const POLL_MS = 2500;
const MAX_POLLS = 24; // ~60s ceiling — then honest-empty rather than a spinner-forever.

export function CauseListFetchLane({ courtId, date }: { courtId: string; date: string }) {
  const t = useTranslations("causeList.retrieve");
  const router = useRouter();
  const [state, setState] = useState<BoardState>("fetching");
  const polls = useRef(0);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function tick() {
      polls.current += 1;
      let status: number | null = null;
      let hasItems = false;
      try {
        const res = await fetch("/api/court/cause-list-fetch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ court_id: courtId, date }),
        });
        const body = (await res.json().catch(() => null)) as { status?: number; hasItems?: boolean } | null;
        // The route already maps the platform status; a synthetic {status:"empty"} arrives as a string.
        status = typeof body?.status === "number" ? body.status : res.ok ? 200 : res.status;
        hasItems = !!body?.hasItems;
      } catch {
        status = null; // network → error outcome
      }
      if (!alive) return;

      const next = nextFromOutcome(outcomeFromStatus(status, hasItems));
      if (next === "held") {
        router.refresh(); // the server board now holds it — re-read + render there
        return;
      }
      if (next === "fetching" && polls.current < MAX_POLLS) {
        timer = setTimeout(tick, POLL_MS);
        return;
      }
      // fetching past the ceiling collapses to empty (honest), else the outcome itself (empty/error).
      setState(next === "fetching" ? "empty" : next);
    }

    tick();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
    // Re-run when the target court/date changes (a new selection).
  }, [courtId, date, router]);

  if (state === "fetching") return <RetrievingSkeleton label={t("body")} title={t("title")} />;

  if (state === "error") {
    return (
      <div className="grid min-h-[160px] place-items-center rounded-ec-s border border-dashed border-ec-hair bg-ec-paper-2/50 text-center">
        <div className="max-w-sm">
          <p className="font-display text-lg text-ec-ink">{t("error.title")}</p>
          <p className="mt-1 text-sm text-ec-ink-3">{t("error.body")}</p>
          <button
            type="button"
            onClick={() => {
              polls.current = 0;
              setState("fetching");
            }}
            className="mt-3 inline-flex items-center gap-1.5 rounded-ec-s border border-ec-hair bg-ec-paper-2 px-3 py-1.5 text-sm text-ec-ink hover:bg-ec-paper-3"
          >
            <Icon name="refresh" className="h-3.5 w-3.5" /> {t("error.retry")}
          </button>
        </div>
      </div>
    );
  }

  // empty — the lane confirmed no board for this court+date.
  return (
    <div className="grid min-h-[160px] place-items-center rounded-ec-s border border-dashed border-ec-hair bg-ec-paper-2/50 text-center">
      <div className="max-w-sm">
        <p className="font-display text-lg text-ec-ink">{t("empty.title")}</p>
        <p className="mt-1 text-sm text-ec-ink-3">{t("empty.body")}</p>
      </div>
    </div>
  );
}

// A quiet, disciplined skeleton — three ghost rows that echo the real board's item-chip + title
// shape, so the retrieve reads as "the board is arriving here", not a generic spinner.
function RetrievingSkeleton({ title, label }: { title: string; label: string }) {
  return (
    <div className="space-y-3" aria-live="polite" aria-busy="true">
      <div className="flex items-center gap-2 text-sm text-ec-ink-2">
        <Icon name="refresh" className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none text-ec-brass-deep" />
        <span className="font-display text-ec-ink">{title}</span>
        <span className="text-ec-ink-3">· {label}</span>
      </div>
      <ul className="divide-y divide-ec-hair overflow-hidden rounded-ec-s border border-ec-hair bg-ec-paper-2">
        {[0, 1, 2].map((i) => (
          <li key={i} className="flex items-center gap-3 px-4 py-3">
            <span className="h-9 w-10 shrink-0 animate-pulse rounded-ec-s bg-ec-hair/60 motion-reduce:animate-none" />
            <div className="min-w-0 flex-1 space-y-1.5">
              <span className="block h-3.5 w-2/3 animate-pulse rounded bg-ec-hair/60 motion-reduce:animate-none" />
              <span className="block h-2.5 w-1/3 animate-pulse rounded bg-ec-hair/40 motion-reduce:animate-none" />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
