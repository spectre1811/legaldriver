"use client";

// WO-84 — the advocate onboarding experience, rebuilt on the truthful phase model
// (`onboardingPhase`). ONE live client component owns a single advocate's onboarding lifecycle and
// renders every phase honestly, fixing the founder's "still broken" complaints:
//   • background + notify — `assembling` (foreground drain) → `gathering` (off-box fleet still landing)
//     → `complete`; the transition into `complete` fires a browser notification (unchanged plumbing —
//     the reference RosterRow just has no visible "enable notify" affordance, see the WO-338 note below).
//   • don't lose it on tab change — state is derived purely from the persisted run record (seeded from
//     the server on every load) and re-synced on tab-refocus, so switching tabs / reloading never drops
//     progress.
//   • no hiccups / no forever-spinner — `complete` is decided by real coverage + elapsed time, and a
//     genuinely-stuck fetch degrades to an actionable `stalled` state, never an eternal spinner.
//
// WO-338 EXACT-FIDELITY RECONCILE · the render now reproduces the reference's `RosterRow`
// (design-mockups/iteration3/console/onboarding.tsx) node-for-node: avatar + name + ONE status chip
// (Complete ✓ / Gathering N% / Attention needed), an optional slim progress bar (gathering only), an
// optional honest note (attention only), a "Last synced" line, and exactly two actions — View matters
// + Re-sync. Every hook/effect/callback below is the SAME WO-84/WO-100/WO-120 engine as before
// (untouched behavior — this WO is restyle-only); only the returned JSX changed. Dropped from the
// render because they're not in the reference (flagged in the WO-338 report as a discovered gap, not
// silently absorbed): the "run details" stat grid, the in-row "notify me" opt-in, the "ready" banner +
// dismiss/ack tracking, the manual "check for new cases" button, and the per-row "Remove" action — the
// FULL cascade delete (advocate + its onboarding_run rows + the matters it onboarded) has no OTHER
// entry point today; Settings' delete only removes the advocate row. The completion notification
// itself still fires (it has no dependent visible node), just with no in-row way to opt in.

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/icons";
import { formatCourtDate } from "@/components/court";
import { stateBarCouncil } from "@/lib/court/bar-number";
import {
  startOnboarding,
  continueOnboarding,
  getOnboardingStatus,
  harvestOnboarding,
  type OnboardingStatus,
} from "./actions";
import { onboardingPhase, type OnboardingPhaseKind } from "@/lib/services/onboarding/progress";

function notificationsAvailable() {
  return typeof window !== "undefined" && "Notification" in window;
}
function fireNotification(title: string, body: string) {
  try {
    if (!notificationsAvailable() || Notification.permission !== "granted") return;
    new Notification(title, { body, tag: "ld-onboarding", icon: "/icon.png" });
  } catch { /* notifications are a nicety — never let one break the page */ }
}

// The three statuses the reference's RosterRow actually renders. `null` (idle — never run) has no
// reference example; we show the meta line honestly with no chip, matching the mockup's spirit.
type Bucket = "complete" | "gathering" | "attention" | null;

export function AdvocateOnboarding({
  advocate,
  initialRun,
}: {
  advocate: { id: string; name: string; bar: string | null; stateCode: string | null };
  initialRun: OnboardingStatus;
}) {
  const t = useTranslations("dashboard.onboarding.roster");
  const td = useTranslations("dashboard.onboarding");
  const tn = useTranslations("dashboard.onboarding.notify"); // completion notification text only — no visible node
  const router = useRouter();

  const [run, setRun] = useState<OnboardingStatus>(initialRun);
  const [now, setNow] = useState<number>(() => (initialRun ? Date.parse(initialRun.updatedAt) || 0 : 0));
  const [busy, setBusy] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  const mounted = useRef(true);
  const prevKind = useRef<OnboardingPhaseKind | null>(null);
  const notifiedFor = useRef<string | null>(null);
  useEffect(() => () => { mounted.current = false; }, []);

  useEffect(() => {
    setHydrated(true);
    setNow(Date.now());
  }, []);

  const phase = onboardingPhase(run, now || Date.now());
  const shouldPoll = phase.active || busy;

  // Fire the completion notification exactly once per completed run, on the live transition into
  // `complete`. A permission granted earlier (another build, another surface) still fires here even
  // though this row has no in-row "enable notifications" entry point (see the header note).
  useEffect(() => {
    const prev = prevKind.current;
    prevKind.current = phase.kind;
    if (!run) return;
    const wasWorking = prev === "assembling" || prev === "gathering" || prev === "stalled";
    if (phase.kind === "complete" && wasWorking && notifiedFor.current !== run.updatedAt) {
      notifiedFor.current = run.updatedAt;
      const n = phase.coverage.total > 0 ? phase.coverage.total : (run.counts?.cases_fetched ?? 0);
      fireNotification(tn("title"), tn("body", { name: advocate.name, n }));
      router.refresh(); // pull the finished practice into the server-rendered lists
    }
  }, [phase.kind, run, phase.coverage.total, advocate.name, router, tn]);

  // Keep the phase live while work is outstanding: re-sync the run record + harvest newly-landed cases.
  useEffect(() => {
    if (!shouldPoll) return;
    let stop = false;
    const sync = async () => {
      try { const st = await getOnboardingStatus(advocate.id); if (!stop && mounted.current && st) setRun(st); } catch { /* transient */ }
    };
    const harvest = async () => {
      try {
        const { added } = await harvestOnboarding(advocate.id);
        if (added > 0 && !stop && mounted.current) router.refresh();
      } catch { /* transient */ }
    };
    const iv1 = setInterval(() => { if (!stop) { setNow(Date.now()); void sync(); } }, 2500);
    const iv2 = setInterval(() => { if (!stop) void harvest(); }, 7000);
    return () => { stop = true; clearInterval(iv1); clearInterval(iv2); };
  }, [shouldPoll, advocate.id, router]);

  // Tab-refocus → immediately re-sync so returning to the tab shows the true current state at once.
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState !== "visible") return;
      setNow(Date.now());
      getOnboardingStatus(advocate.id).then((st) => { if (st && mounted.current) setRun(st); }).catch(() => {});
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [advocate.id]);

  const runOnboarding = useCallback(() => {
    if (busy) return;
    setBusy(true);
    (async () => {
      try {
        let r = await startOnboarding(advocate.id);
        const st0 = await getOnboardingStatus(advocate.id); if (st0 && mounted.current) setRun(st0);
        // BP-73: a large roster returns done:false in bounded chunks — keep draining until it finishes.
        let guard = 0;
        while (r.ok && r.done === false && r.runId && mounted.current && guard < 40) {
          guard++;
          r = await continueOnboarding(r.runId);
          const st = await getOnboardingStatus(advocate.id); if (st && mounted.current) setRun(st);
        }
      } catch {
        // A transient reject must never crash the page — completed stages are already persisted; the
        // cron backstop (or another Re-sync click) finishes the rest.
      } finally {
        if (mounted.current) {
          setBusy(false);
          try { const st = await getOnboardingStatus(advocate.id); if (st) setRun(st); } catch { /* noop */ }
          setNow(Date.now());
          router.refresh();
        }
      }
    })();
  }, [advocate.id, busy, router]);

  // WO-100: auto-resume a RUNNING run on load/refocus — opening the page drives an abandoned run to
  // `done` via the SAME bounded continue-loop Re-sync uses. Guarded so it never double-drives.
  const autoResumeRef = useRef<string | null>(null);
  const activeRunId = hydrated && !busy && run?.status === "running" ? (run?.id ?? null) : null;
  useEffect(() => {
    if (!activeRunId || autoResumeRef.current === activeRunId) return;
    autoResumeRef.current = activeRunId;
    let stop = false;
    (async () => {
      let guard = 0;
      let res = await continueOnboarding(activeRunId);
      while (res.ok && res.done === false && !stop && mounted.current && guard < 40) {
        guard++;
        const st = await getOnboardingStatus(advocate.id); if (st && mounted.current && !stop) setRun(st);
        res = await continueOnboarding(activeRunId);
      }
      if (mounted.current && !stop) {
        const st = await getOnboardingStatus(advocate.id); if (st) setRun(st);
        setNow(Date.now()); router.refresh();
      }
    })().catch(() => { /* transient — the cron backstop or another Re-sync finishes it */ });
    return () => { stop = true; };
  }, [activeRunId, advocate.id, router]);

  // ── reference RosterRow derivation — one of 3 buckets, never a 4th/5th invented one ──────────────
  const bucket: Bucket =
    phase.kind === "complete" ? "complete"
    : phase.kind === "assembling" || phase.kind === "gathering" || (busy && phase.kind === "idle") ? "gathering"
    : phase.kind === "stalled" || phase.kind === "error" ? "attention"
    : null;

  const percent =
    phase.kind === "assembling" ? phase.progress.percent
    : phase.kind === "gathering" ? (phase.coverage.total > 0 ? Math.round((phase.coverage.detailed / phase.coverage.total) * 100) : phase.progress.percent)
    : 0;

  const note =
    phase.kind === "error" ? (run?.message || t("errorFallback"))
    : phase.kind === "stalled" ? t("stalledNote")
    : null;

  const stateLabel = stateBarCouncil(advocate.stateCode)?.label ?? null;
  const matters = phase.coverage.total;

  return (
    // Reference: RosterRow. Avatar + name + status chip, a mono bar/state/matters line, an optional
    // gathering progress bar, an optional attention note, a "Last synced" stamp, then two actions.
    <li className="ec-row grid grid-cols-1 gap-2 px-1 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
      <div className="flex min-w-0 items-start gap-3">
        <span className="font-display grid h-9 w-9 shrink-0 place-items-center rounded-full bg-ec-paper-3 text-[13px] text-ec-bronze-deep" aria-hidden>
          {advocate.name.slice(0, 1).toUpperCase()}
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-display truncate text-[16px] text-ec-ink">{advocate.name}</span>
            {bucket === "complete" && <span className="ec-chip ec-chip-honey">{t("complete")}</span>}
            {bucket === "gathering" && <span className="ec-chip ec-chip-hot">{t("gathering", { n: percent })}</span>}
            {bucket === "attention" && <span className="ec-chip ec-chip-warn">{t("attention")}</span>}
          </div>
          <div className="num mt-0.5 font-mono text-[11.5px] text-ec-ink-3">
            {advocate.bar || t("noBar")} · {stateLabel ?? t("stateUnknown")} · {t("matters", { n: matters })}
          </div>

          {bucket === "gathering" && (
            <div className="mt-2 h-[3px] w-40 overflow-hidden rounded-full bg-ec-paper-3">
              <div className="h-full rounded-full bg-ec-bronze transition-all duration-700 motion-reduce:transition-none" style={{ width: `${percent}%` }} />
            </div>
          )}

          {note && (
            <p className="mt-1.5 flex items-start gap-1.5 text-[12.5px] text-ec-warn">
              <Icon name="alert" className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {note}
            </p>
          )}

          <div className="num mt-1 font-mono text-[10.5px] uppercase tracking-[0.12em] text-ec-ink-3">
            {/* WO-338: reference shows date + time ("3 Aug 2026 · 07:42 IST"); we render the real
                updatedAt through the existing day-granularity formatCourtDate — a deliberate,
                documented simplification (no HH:MM/IST formatter exists yet). */}
            {run ? t("lastSynced", { date: formatCourtDate(run.updatedAt) ?? "—" }) : t("notRun")}
          </div>
        </div>
      </div>

      {/* action cluster — reference: "View matters" + "Re-sync" (exactly two) */}
      <div className="flex shrink-0 items-center gap-1 sm:justify-end">
        <Link
          href="/dashboard/cases"
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[12.5px] text-ec-ink-2 transition-colors hover:bg-ec-paper-3 hover:text-ec-bronze"
        >
          {/* no distinct ArrowRight glyph in this repo's icon set — "chevron" already fills this exact
              slot elsewhere (e.g. the Cases "view all" link) */}
          {td("viewMatters")} <Icon name="chevron" className="h-3 w-3" />
        </Link>
        <button
          type="button"
          onClick={runOnboarding}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[12.5px] text-ec-ink-3 transition-colors hover:bg-ec-paper-3 hover:text-ec-ink-2 disabled:opacity-50"
        >
          <Icon name="refresh" className={`h-3.5 w-3.5 ${busy ? "animate-spin motion-reduce:animate-none" : ""}`} /> {t("resync")}
        </button>
      </div>
    </li>
  );
}
