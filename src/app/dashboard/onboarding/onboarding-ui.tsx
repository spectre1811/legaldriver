"use client";

// WO-84 — the advocate onboarding experience, rebuilt on the truthful phase model
// (`onboardingPhase`). ONE live client component owns a single advocate's onboarding lifecycle and
// renders every phase honestly, fixing the founder's "still broken" complaints:
//   • background + notify — `assembling` (foreground drain) → `gathering` (off-box fleet still landing)
//     → `complete`; the transition into `complete` fires a browser notification + an in-app "ready"
//     banner, so the user can leave and be told when it's done.
//   • don't lose it on tab change — state is derived purely from the persisted run record (seeded from
//     the server on every load) and re-synced on tab-refocus, so switching tabs / reloading never drops
//     progress. A completion that happened while away surfaces as a "ready" banner on return.
//   • no hiccups / no forever-spinner — `complete` is decided by real coverage + elapsed time, and a
//     genuinely-stuck fetch degrades to an actionable `stalled` state, never an eternal spinner.

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/icons";
import { ConfirmDelete } from "@/components/confirm-delete";
import { formatCourtDate } from "@/components/court";
import {
  startOnboarding,
  continueOnboarding,
  deleteOnboarding,
  getOnboardingStatus,
  harvestOnboarding,
  type OnboardingStatus,
} from "./actions";
import {
  onboardingPhase,
  ONBOARDING_STAGES,
  type OnboardingCoverage,
  type OnboardingPhaseKind,
  type OnboardingProgress,
} from "@/lib/services/onboarding/progress";

// WO-338 · Daybreak/Chambers skin (design-mockups/iteration3/console/onboarding.tsx's RosterRow +
// GatheringCard) — restyles this component's RENDER ONLY onto the `ec-*` token set: every hook,
// effect, callback and the phase state machine below are byte-identical to the pre-WO-338 version
// (WO-84/WO-100/WO-120 behavior). The reference's single-advocate demo swap (AddAdvocateCard ↔
// GatheringCard) doesn't fit our real model (N advocates, each independently live, surviving reload)
// — so its checklist/progress-bar VISUAL LANGUAGE is applied per-row here instead, faithfully, to
// the two real phases that actually carry it: `assembling` (stage-ordered checklist, from the real
// ONBOARDING_STAGES + the run's current stageKey — never a fabricated list) and `gathering` (the
// real N-of-M coverage meter, styled as the reference's bronze progress bar).

const CHIP_TONE: Record<OnboardingPhaseKind, string> = {
  idle: "ec-chip",
  assembling: "ec-chip ec-chip-hot",
  gathering: "ec-chip ec-chip-hot",
  stalled: "ec-chip ec-chip-warn",
  complete: "ec-chip ec-chip-success",
  error: "ec-chip ec-chip-danger",
};

// The serializable run snapshot the server seeds us with, matching `getOnboardingStatus`.
type RunSnapshot = OnboardingStatus;

// ── persistence (survives tab close / reload) ────────────────────────────────────────────────────
// We remember, per advocate, the `updated_at` of the last completion the user has acknowledged. On
// return, an unacknowledged completion shows the "ready" banner; a browser notification fires only on a
// live transition (guarded separately) so a revisit never re-spams. localStorage is best-effort — any
// failure (private mode, SSR) degrades to "not yet seen", never throws.
const ackKey = (id: string) => `ld.onboarding.ack.${id}`;
function readAck(id: string): string | null {
  try { return typeof window === "undefined" ? null : window.localStorage.getItem(ackKey(id)); } catch { return null; }
}
function writeAck(id: string, v: string) {
  try { window.localStorage.setItem(ackKey(id), v); } catch { /* best-effort */ }
}

function notificationsAvailable() {
  return typeof window !== "undefined" && "Notification" in window;
}
function fireNotification(title: string, body: string) {
  try {
    if (!notificationsAvailable() || Notification.permission !== "granted") return;
    new Notification(title, { body, tag: "ld-onboarding", icon: "/icon.png" });
  } catch { /* notifications are a nicety — never let one break the page */ }
}

// ── small presentational pieces ──────────────────────────────────────────────────────────────────
// The live "assembling" checklist (reference: GatheringCard's stage list) — driven purely by the
// real ONBOARDING_STAGES order + the run's actual progress.index; never a fabricated step list.
function StageBar({ progress }: { progress: OnboardingProgress }) {
  const ts = useTranslations("onboarding.stage");
  const label = ts.has(progress.stageKey) ? ts(progress.stageKey) : progress.label;
  const checklist = ONBOARDING_STAGES.filter((s) => s !== "done");
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[13px]">
        <span className="font-medium text-ec-ink">{label}</span>
        <span className="num font-display text-ec-bronze-deep">{progress.percent}%</span>
      </div>
      <div className="h-1 w-full max-w-xs overflow-hidden rounded-full bg-ec-paper-3">
        <div
          className="h-full rounded-full bg-ec-bronze transition-all duration-700 motion-reduce:transition-none"
          style={{ width: `${progress.percent}%` }}
        />
      </div>
      <ul className="mt-3 space-y-2">
        {checklist.map((key, i) => {
          const state = i < progress.index ? "done" : i === progress.index ? "running" : "todo";
          return (
            <li key={key} className="stagger flex items-center gap-2.5 text-[12.5px]" style={{ animationDelay: `${i * 90}ms` }}>
              {state === "done" ? (
                <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-ec-bronze text-white">
                  <Icon name="check" className="h-2.5 w-2.5" />
                </span>
              ) : state === "running" ? (
                <Icon name="refresh" className="h-3.5 w-3.5 shrink-0 animate-spin text-ec-honey motion-reduce:animate-none" />
              ) : (
                <span className="h-4 w-4 shrink-0 rounded-full border border-ec-hair-strong" />
              )}
              <span className={state === "todo" ? "text-ec-ink-3" : "text-ec-ink-2"}>{ts.has(key) ? ts(key) : key}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// The honest "N of M with full detail" meter — coverage, not a guess. Tabular nums; degrades to a calm
// "fetching…" line before the roster size is known.
function CoverageMeter({ coverage }: { coverage: OnboardingCoverage }) {
  const t = useTranslations("onboarding.coverage");
  if (coverage.total <= 0) return <p className="text-xs text-ec-ink-3">{t("fetching")}</p>;
  const pct = coverage.total > 0 ? Math.round((coverage.detailed / coverage.total) * 100) : 0;
  return (
    <div className="w-full max-w-xs">
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="num font-medium text-ec-ink">{t("onFile", { n: coverage.total })}</span>
        <span className="num text-ec-ink-3">
          {coverage.filling ? t("detailed", { done: coverage.detailed, total: coverage.total }) : t("allIn")}
        </span>
      </div>
      <div className="h-1 w-full overflow-hidden rounded-full bg-ec-paper-3">
        <div
          className="h-full rounded-full bg-ec-bronze transition-all duration-500 motion-reduce:transition-none"
          style={{ width: `${Math.max(coverage.filling ? 4 : 100, pct)}%` }}
        />
      </div>
    </div>
  );
}

// ── the main per-advocate live component ─────────────────────────────────────────────────────────
export function AdvocateOnboarding({
  advocate,
  initialRun,
}: {
  advocate: { id: string; name: string; bar: string | null; stateCode: string | null };
  initialRun: RunSnapshot;
}) {
  const t = useTranslations("onboarding");
  const td = useTranslations("dashboard.onboarding");
  const router = useRouter();

  const [run, setRun] = useState<RunSnapshot>(initialRun);
  const [now, setNow] = useState<number>(() => (initialRun ? Date.parse(initialRun.updatedAt) || 0 : 0));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [arrived, setArrived] = useState(0);
  const [checking, setChecking] = useState(false);
  const [notifyOn, setNotifyOn] = useState(false);
  const [notifyBlocked, setNotifyBlocked] = useState(false);
  const [acked, setAcked] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  const mounted = useRef(true);
  const prevKind = useRef<OnboardingPhaseKind | null>(null);
  const notifiedFor = useRef<string | null>(null);
  useEffect(() => () => { mounted.current = false; }, []);

  // Hydrate client-only bits (localStorage ack + current notification permission) after mount, so the
  // server/client markup matches and we never touch `window` during render.
  useEffect(() => {
    setAcked(readAck(advocate.id));
    setHydrated(true);
    setNow(Date.now());
    try { if (notificationsAvailable() && Notification.permission === "granted") setNotifyOn(true); } catch { /* noop */ }
  }, [advocate.id]);

  const phase = onboardingPhase(run, now || Date.now());
  const shouldPoll = phase.active || busy;

  // Fire the completion notification exactly once per completed run, on the live transition into
  // `complete` (never on a fresh load of an already-complete run — that path leaves prevKind null).
  useEffect(() => {
    const prev = prevKind.current;
    prevKind.current = phase.kind;
    if (!run) return;
    const wasWorking = prev === "assembling" || prev === "gathering" || prev === "stalled";
    if (phase.kind === "complete" && wasWorking && notifiedFor.current !== run.updatedAt) {
      notifiedFor.current = run.updatedAt;
      const n = phase.coverage.total > 0 ? phase.coverage.total : (run.counts?.cases_fetched ?? 0);
      fireNotification(t("notify.title"), t("notify.body", { name: advocate.name, n }));
      router.refresh(); // pull the finished practice into the server-rendered lists
    }
  }, [phase.kind, run, phase.coverage.total, advocate.name, router, t]);

  // Keep the phase live while work is outstanding: re-sync the run record + harvest newly-landed cases.
  // Bounded intervals, cleared on unmount or when the phase goes inactive — never an endless background poll.
  useEffect(() => {
    if (!shouldPoll) return;
    let stop = false;
    const sync = async () => {
      try { const st = await getOnboardingStatus(advocate.id); if (!stop && mounted.current && st) setRun(st); } catch { /* transient */ }
    };
    const harvest = async () => {
      try {
        const { added } = await harvestOnboarding(advocate.id);
        if (added > 0 && !stop && mounted.current) { setArrived((n) => n + added); router.refresh(); }
      } catch { /* transient */ }
    };
    const iv1 = setInterval(() => { if (!stop) { setNow(Date.now()); void sync(); } }, 2500);
    const iv2 = setInterval(() => { if (!stop) void harvest(); }, 7000);
    return () => { stop = true; clearInterval(iv1); clearInterval(iv2); };
  }, [shouldPoll, advocate.id, router]);

  // Tab-refocus → immediately re-sync so returning to the tab shows the true current state at once
  // (not a stale snapshot until the next poll). This is the "don't lose it on tab change" guarantee.
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
    setBusy(true); setMsg(""); setArrived(0);
    (async () => {
      try {
        let r = await startOnboarding(advocate.id);
        if (mounted.current) setMsg(r.message);
        const st0 = await getOnboardingStatus(advocate.id); if (st0 && mounted.current) setRun(st0);
        // BP-73: a large roster returns done:false in bounded chunks — keep draining until it finishes.
        let guard = 0;
        while (r.ok && r.done === false && r.runId && mounted.current && guard < 40) {
          guard++;
          r = await continueOnboarding(r.runId);
          if (mounted.current) setMsg(r.message);
          const st = await getOnboardingStatus(advocate.id); if (st && mounted.current) setRun(st);
        }
      } catch {
        // A bounded drain shouldn't hit the 60s cap, but a transient reject must never crash the page —
        // completed stages are already persisted; the cron backstop (or a re-run) finishes the rest.
        if (mounted.current) setMsg(t("timeout"));
      } finally {
        if (mounted.current) {
          setBusy(false);
          try { const st = await getOnboardingStatus(advocate.id); if (st) setRun(st); } catch { /* noop */ }
          setNow(Date.now());
          router.refresh();
        }
      }
    })();
  }, [advocate.id, busy, router, t]);

  // WO-100: auto-resume a RUNNING run on load/refocus. A run the user started then left (tab closed)
  // used to sit at a mid-pipeline % until the once-a-day cron nudged it; now simply opening the page
  // drives it to `done` via the SAME bounded continue-loop the Re-run button uses. Guarded so it never
  // double-drives: `activeRunId` is null unless hydrated + not busy (a Re-run click yields) + status is
  // "running", and the ref makes it at-most-once per run id. The drain is idempotent + resumable, so a
  // stopped/overlapping drive is always safe — the worst case is a redundant, harmless call.
  const autoResumeRef = useRef<string | null>(null);
  const activeRunId = hydrated && !busy && run?.status === "running" ? (run?.id ?? null) : null;
  useEffect(() => {
    if (!activeRunId || autoResumeRef.current === activeRunId) return;
    autoResumeRef.current = activeRunId;
    let stop = false;
    (async () => {
      let guard = 0;
      let res = await continueOnboarding(activeRunId);
      if (mounted.current && !stop && res.message) setMsg(res.message);
      while (res.ok && res.done === false && !stop && mounted.current && guard < 40) {
        guard++;
        const st = await getOnboardingStatus(advocate.id); if (st && mounted.current && !stop) setRun(st);
        res = await continueOnboarding(activeRunId);
        if (mounted.current && !stop && res.message) setMsg(res.message);
      }
      if (mounted.current && !stop) {
        const st = await getOnboardingStatus(advocate.id); if (st) setRun(st);
        setNow(Date.now()); router.refresh();
      }
    })().catch(() => { /* transient — the cron backstop or a re-run finishes it */ });
    return () => { stop = true; };
  }, [activeRunId, advocate.id, router]);

  const checkNow = useCallback(() => {
    if (checking) return;
    setChecking(true);
    (async () => {
      try {
        const { added } = await harvestOnboarding(advocate.id);
        if (mounted.current && added > 0) { setArrived((n) => n + added); router.refresh(); }
        const st = await getOnboardingStatus(advocate.id); if (st && mounted.current) setRun(st);
      } catch { /* transient */ } finally {
        if (mounted.current) { setNow(Date.now()); setChecking(false); }
      }
    })();
  }, [advocate.id, checking, router]);

  const enableNotify = useCallback(async () => {
    if (!notificationsAvailable()) return;
    try {
      if (Notification.permission === "granted") { setNotifyOn(true); return; }
      if (Notification.permission === "denied") { setNotifyBlocked(true); return; }
      const perm = await Notification.requestPermission();
      setNotifyOn(perm === "granted");
      setNotifyBlocked(perm === "denied");
    } catch { /* noop */ }
  }, []);

  const ackReady = useCallback(() => {
    if (run) { writeAck(advocate.id, run.updatedAt); setAcked(run.updatedAt); }
  }, [advocate.id, run]);

  const counts = (run?.counts ?? {}) as Record<string, number>;
  const readyCount = phase.coverage.total > 0 ? phase.coverage.total : (counts.cases_fetched ?? 0);
  const showReady = hydrated && phase.kind === "complete" && !!run && run.updatedAt !== acked && readyCount > 0;
  // gate on `hydrated` too: `notificationsAvailable()` is false on the server but true on the client, so
  // rendering this without the guard would trip a hydration mismatch on the first client paint.
  const canNotify = hydrated && notificationsAvailable() && !notifyOn && (phase.active || busy);

  return (
    // Reference: RosterRow. Avatar + name + status chip up top, a mono bar/state/coverage line,
    // the live phase panel, an always-visible last-synced stamp, then the action cluster.
    // WO-338: the action cluster (View matters + Run/Re-run + Remove, three real-copy items, never
    // a single icon) needs more room than the reference's dummy row did — a `sm:` (640px) 2-column
    // split squeezed the name down to ~150px and truncated it (caught render-inspecting 768px, the
    // same class of bug WO-333 flagged). `lg:` (1024px) is where the sidebar also kicks in, so the
    // main column actually has the room; below that the row stacks full-width instead.
    <li className="ec-row grid grid-cols-1 gap-2 px-1 py-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
      <div className="flex min-w-0 items-start gap-3">
        <span className="font-display grid h-9 w-9 shrink-0 place-items-center rounded-full bg-ec-paper-3 text-[13px] text-ec-bronze-deep" aria-hidden>
          {advocate.name.slice(0, 1).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-display truncate text-[16px] text-ec-ink">{advocate.name}</span>
            {run && phase.kind !== "idle" && (
              <span className={CHIP_TONE[phase.kind]}>{t(`phaseBadge.${phase.kind}`)}</span>
            )}
          </div>
          <div className="num mt-0.5 font-mono text-[11.5px] text-ec-ink-3">
            {advocate.bar ? t("bar", { n: advocate.bar }) : t("noBar")}
            {advocate.stateCode ? ` · ${advocate.stateCode}` : ""}
            {phase.coverage.total > 0 ? ` · ${t("coverage.onFile", { n: phase.coverage.total })}` : ""}
          </div>

          {/* live panel — one region per phase, polite live updates for assistive tech */}
          <div aria-live="polite" className="mt-2.5 space-y-2.5">
            {/* ASSEMBLING — foreground drain, the real stage-ordered checklist */}
            {(phase.kind === "assembling" || (busy && phase.kind === "idle")) && (
              <div className="max-w-sm rounded-ec-m border border-ec-hair bg-ec-paper-3/40 px-3.5 py-3">
                <StageBar progress={phase.progress} />
                <p className="mt-2.5 text-[11.5px] text-ec-ink-3">{t("background.leaveHint")}</p>
              </div>
            )}

            {/* GATHERING — off-box fleet still landing the roster; user can leave */}
            {phase.kind === "gathering" && (
              <div className="max-w-sm rounded-ec-m border border-ec-hair bg-ec-paper-3/40 px-3.5 py-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex min-w-0 items-start gap-2">
                    <Icon name="refresh" className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin text-ec-bronze-deep motion-reduce:animate-none" />
                    <p className="text-[12.5px] font-medium text-ec-bronze-deep">{t("background.title")}</p>
                  </div>
                  <button onClick={checkNow} disabled={checking} className="press shrink-0 text-[11.5px] text-ec-ink-2 hover:text-ec-bronze-deep">
                    {checking ? t("background.checking") : t("background.check")}
                  </button>
                </div>
                <p className="mt-1 text-[11.5px] text-ec-ink-3">{t("background.leaveHint")}</p>
                <div className="mt-2.5"><CoverageMeter coverage={phase.coverage} /></div>
                {arrived > 0 && <p className="mt-2 text-[11.5px] font-medium text-ec-success">{t("background.arrived", { n: arrived })}</p>}
                {canNotify && (
                  <button onClick={enableNotify} className="mt-2 inline-flex items-center gap-1.5 text-[11.5px] text-ec-bronze-deep hover:underline">
                    <Icon name="bell" className="h-3.5 w-3.5" /> {t("notify.enable")}
                  </button>
                )}
                {notifyOn && <p className="mt-2 inline-flex items-center gap-1.5 text-[11.5px] text-ec-ink-3"><Icon name="check" className="h-3.5 w-3.5" /> {t("notify.enabled")}</p>}
                {notifyBlocked && <p className="mt-2 text-[11.5px] text-ec-ink-3">{t("notify.blocked")}</p>}
              </div>
            )}

            {/* STALLED — honest, actionable; never a forever spinner (reference: the roster row's warning note) */}
            {phase.kind === "stalled" && (
              <p className="flex items-start gap-1.5 text-[12.5px] text-ec-warn">
                <Icon name="alert" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  {t("stalled.title")} — {t("stalled.body")}{" "}
                  <button onClick={checkNow} disabled={checking} className="font-medium hover:underline">
                    {checking ? t("stalled.refreshing") : t("stalled.refresh")}
                  </button>
                </span>
              </p>
            )}

            {/* COMPLETE — the "ready" payoff banner (unacknowledged completions surface on return too) */}
            {showReady && (
              <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-ec-m border border-ec-hair bg-ec-success-bg/50 px-3.5 py-2.5">
                <p className="text-[12.5px] text-ec-ink-2">
                  {t("ready.title", { name: advocate.name })} — {t("ready.body", { n: readyCount })}
                </p>
                <div className="flex shrink-0 items-center gap-1.5">
                  <Link href="/dashboard/cases" onClick={ackReady} className="rounded-ec-s bg-ec-ink px-2.5 py-1 text-[11.5px] font-medium text-white hover:opacity-90">
                    {t("ready.view")}
                  </Link>
                  <button onClick={ackReady} aria-label={t("ready.dismiss")} className="rounded-ec-s p-1 text-ec-ink-3 hover:bg-ec-paper-3">
                    <Icon name="close" className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            )}

            {/* ERROR — human message + recovery (re-run via the button in the action cluster) */}
            {phase.kind === "error" && run?.message && (
              <p role="alert" className="flex items-start gap-1.5 text-[12.5px] text-ec-danger">
                <Icon name="alert" className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {run.message}
              </p>
            )}

            {msg && <p className="text-[11.5px] text-ec-ink-3">{msg}</p>}
          </div>

          {/* last-synced stamp (reference: "Last synced …") + run details */}
          <div className="num mt-2 font-mono text-[10.5px] uppercase tracking-[0.12em] text-ec-ink-3">
            {run ? t("lastRun", { date: (formatCourtDate(run.updatedAt) ?? "—") }) : t("phaseBadge.idle")}
          </div>
          {run && (
            <details className="group mt-1.5 text-[11.5px]">
              <summary className="flex cursor-pointer list-none items-center gap-1.5 text-ec-ink-3 hover:text-ec-ink-2">
                <Icon name="chevron" className="h-3 w-3 transition group-open:rotate-90 motion-reduce:transition-none" />
                {t("runDetails")}
              </summary>
              <div className="mt-2.5 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
                <Stat label={t("stat.rosterTotal")} value={counts.roster_total ?? counts.cases_fetched ?? 0} />
                <Stat label={t("stat.casesFetched")} value={counts.cases_fetched ?? 0} />
                <Stat label={t("stat.enriched")} value={counts.enriched ?? 0} />
                <Stat label={t("stat.causelist")} value={counts.matters_seeded ?? 0} />
                <Stat label={t("stat.deadlinesProposed")} value={counts.deadlines_proposed ?? 0} />
                <Stat label={t("stat.emailsFiled")} value={counts.inbox_filed ?? 0} />
                <Stat label={t("stat.docsFiled")} value={counts.docs_attached ?? 0} />
                <Stat label={t("stat.closedFound")} value={counts.closed_found ?? 0} />
                <Stat label={t("stat.briefingsQueued")} value={counts.summaries_queued ?? 0} />
              </div>
            </details>
          )}
        </div>
      </div>

      {/* action cluster — reference: "View matters" + "Re-sync" */}
      <div className="flex shrink-0 flex-wrap items-center gap-1 lg:justify-end lg:pl-3">
        <Link
          href="/dashboard/cases"
          className="inline-flex items-center gap-1 rounded-ec-s px-2 py-1 text-[12px] text-ec-ink-2 transition-colors hover:bg-ec-paper-3 hover:text-ec-bronze-deep"
        >
          {td("viewMatters")} <Icon name="chevron" className="h-3 w-3" />
        </Link>
        <button
          onClick={runOnboarding}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-ec-s bg-ec-ink px-2.5 py-1.5 text-[12px] font-medium text-white transition hover:opacity-90 disabled:opacity-50"
        >
          <Icon name={busy ? "refresh" : "sparkles"} className={`h-3.5 w-3.5 ${busy ? "animate-spin motion-reduce:animate-none" : ""}`} />
          {busy ? t("running") : run ? t("rerun") : t("run")}
        </button>
        <ConfirmDelete
          action={deleteOnboarding}
          id={advocate.id}
          label={t("remove")}
          confirmLabel={t("remove")}
          note={t("removeConfirm", { name: advocate.name })}
        />
      </div>
    </li>
  );
}

// A compact labelled tally for the run-details grid — tabular numerals, never a bare number.
function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-ec-m border border-ec-hair bg-ec-paper/40 px-3 py-2">
      <p className="ec-label truncate">{label}</p>
      <p className="font-display num mt-0.5 text-lg font-semibold text-ec-ink">{value}</p>
    </div>
  );
}
