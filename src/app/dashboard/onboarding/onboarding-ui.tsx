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
import { Badge } from "@/components/ui";
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
  type OnboardingCoverage,
  type OnboardingPhaseKind,
  type OnboardingProgress,
} from "@/lib/services/onboarding/progress";

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
function StageBar({ progress }: { progress: OnboardingProgress }) {
  const ts = useTranslations("onboarding.stage");
  const label = ts.has(progress.stageKey) ? ts(progress.stageKey) : progress.label;
  return (
    <div className="w-full max-w-xs">
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="font-medium text-ink">{label}</span>
        <span className="tabular-nums text-ink-muted">{progress.percent}%</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-line">
        <div
          className="h-full rounded-full bg-brand-600 transition-all duration-500 motion-reduce:transition-none"
          style={{ width: `${progress.percent}%` }}
        />
      </div>
    </div>
  );
}

// The honest "N of M with full detail" meter — coverage, not a guess. Tabular nums; degrades to a calm
// "fetching…" line before the roster size is known.
function CoverageMeter({ coverage }: { coverage: OnboardingCoverage }) {
  const t = useTranslations("onboarding.coverage");
  if (coverage.total <= 0) return <p className="text-xs text-ink-muted">{t("fetching")}</p>;
  const pct = coverage.total > 0 ? Math.round((coverage.detailed / coverage.total) * 100) : 0;
  return (
    <div className="w-full max-w-xs">
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="font-medium text-ink tabular-nums">{t("onFile", { n: coverage.total })}</span>
        <span className="tabular-nums text-ink-muted">
          {coverage.filling ? t("detailed", { done: coverage.detailed, total: coverage.total }) : t("allIn")}
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-line">
        <div
          className="h-full rounded-full bg-brand-500 transition-all duration-500 motion-reduce:transition-none"
          style={{ width: `${Math.max(coverage.filling ? 4 : 100, pct)}%` }}
        />
      </div>
    </div>
  );
}

const BADGE_TONE: Record<OnboardingPhaseKind, "neutral" | "brand" | "green" | "amber" | "red"> = {
  idle: "neutral", assembling: "brand", gathering: "brand", stalled: "amber", complete: "green", error: "red",
};

// ── the main per-advocate live component ─────────────────────────────────────────────────────────
export function AdvocateOnboarding({
  advocate,
  initialRun,
}: {
  advocate: { id: string; name: string; bar: string | null; stateCode: string | null };
  initialRun: RunSnapshot;
}) {
  const t = useTranslations("onboarding");
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
    <div className="px-5 py-4">
      {/* action row: identity · live status · controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium">{advocate.name}</p>
          <p className="text-xs text-ink-muted">
            {advocate.bar ? t("bar", { n: advocate.bar }) : t("noBar")}
            {advocate.stateCode ? ` · ${advocate.stateCode}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {run && phase.kind !== "idle" && (
            <Badge tone={BADGE_TONE[phase.kind]}>{t(`phaseBadge.${phase.kind}`)}</Badge>
          )}
          <button onClick={runOnboarding} disabled={busy} className="btn-primary">
            <Icon name={busy ? "refresh" : "sparkles"} className={`h-4 w-4 ${busy ? "animate-spin motion-reduce:animate-none" : ""}`} />{" "}
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
      </div>

      {/* live panel — one region per phase, polite live updates for assistive tech */}
      <div aria-live="polite" className="mt-3 space-y-3">
        {/* ASSEMBLING — foreground drain */}
        {(phase.kind === "assembling" || (busy && phase.kind === "idle")) && (
          <div className="rounded-xl border border-brand-100 bg-brand-50/50 px-4 py-3">
            <StageBar progress={phase.progress} />
            <p className="mt-2 text-xs text-ink-muted">{t("background.leaveHint")}</p>
          </div>
        )}

        {/* GATHERING — off-box fleet still landing the roster; user can leave */}
        {phase.kind === "gathering" && (
          <div className="rounded-xl border border-brand-100 bg-brand-50/60 px-4 py-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3">
                <Icon name="refresh" className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-brand-600 motion-reduce:animate-none" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-brand-800">{t("background.title")}</p>
                  <p className="mt-0.5 text-xs text-ink-muted">{t("background.leaveHint")}</p>
                </div>
              </div>
              <button onClick={checkNow} disabled={checking} className="btn-secondary shrink-0 text-xs">
                {checking ? t("background.checking") : t("background.check")}
              </button>
            </div>
            <div className="mt-3"><CoverageMeter coverage={phase.coverage} /></div>
            {arrived > 0 && <p className="mt-2 text-xs font-medium text-emerald-700">{t("background.arrived", { n: arrived })}</p>}
            {canNotify && (
              <button onClick={enableNotify} className="mt-2 inline-flex items-center gap-1.5 text-xs text-brand-600 hover:underline">
                <Icon name="bell" className="h-3.5 w-3.5" /> {t("notify.enable")}
              </button>
            )}
            {notifyOn && <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-ink-faint"><Icon name="check" className="h-3.5 w-3.5" /> {t("notify.enabled")}</p>}
            {notifyBlocked && <p className="mt-2 text-xs text-ink-faint">{t("notify.blocked")}</p>}
          </div>
        )}

        {/* STALLED — honest, actionable; never a forever spinner */}
        {phase.kind === "stalled" && (
          <div className="rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3">
            <div className="flex items-start gap-3">
              <Icon name="clock" className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-amber-900">{t("stalled.title")}</p>
                <p className="mt-0.5 text-xs text-ink-muted">{t("stalled.body")}</p>
                <button onClick={checkNow} disabled={checking} className="btn-secondary mt-2 text-xs">
                  {checking ? t("stalled.refreshing") : t("stalled.refresh")}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* COMPLETE — the "ready" payoff banner (unacknowledged completions surface on return too) */}
        {showReady && (
          <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50/70 px-4 py-3">
            <div className="flex items-start gap-3">
              <Icon name="check" className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
              <div>
                <p className="text-sm font-medium text-emerald-900">{t("ready.title", { name: advocate.name })}</p>
                <p className="mt-0.5 text-xs text-ink-muted">{t("ready.body", { n: readyCount })}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Link href="/dashboard/cases" onClick={ackReady} className="btn-primary text-xs">
                {t("ready.view")}
              </Link>
              <button onClick={ackReady} aria-label={t("ready.dismiss")} className="rounded-md p-1.5 text-ink-muted hover:bg-emerald-100/60">
                <Icon name="close" className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* ERROR — human message + recovery (re-run via the button above) */}
        {phase.kind === "error" && run?.message && (
          <p role="alert" className="rounded-xl bg-red-50 px-3.5 py-2.5 text-sm text-red-700">{run.message}</p>
        )}

        {/* terminal note (honest summary / timeout hint) + last-run stamp */}
        {msg && <p className="text-xs text-ink-muted">{msg}</p>}
        {run && (
          <details className="group text-xs">
            <summary className="flex cursor-pointer list-none items-center gap-1.5 text-ink-faint hover:text-ink">
              <Icon name="chevron" className="h-3.5 w-3.5 transition group-open:rotate-90 motion-reduce:transition-none" />
              {t("lastRun", { date: (formatCourtDate(run.updatedAt) ?? "—") })} · {t("runDetails")}
            </summary>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
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
  );
}

// A compact labelled tally for the run-details grid — tabular numerals, never a bare number.
function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-line bg-paper/40 px-3 py-2">
      <p className="text-[0.7rem] uppercase tracking-wide text-ink-faint">{label}</p>
      <p className="mt-0.5 font-serif text-lg font-semibold tabular-nums text-ink">{value}</p>
    </div>
  );
}
