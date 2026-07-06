"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/icons";
import { ConfirmDelete } from "@/components/confirm-delete";
import { startOnboarding, continueOnboarding, deleteOnboarding, getOnboardingStatus, harvestOnboarding, type OnboardingStatus } from "./actions";
import { onboardingProgress, onboardingCountsSummary } from "@/lib/services/onboarding/progress";

// BP-71 W2 / WO-61: a live progress bar over the real onboarding_run record (stage + counts). WO-61
// localizes the stage label via the `stageKey` (EN `label` stays the fallback) so the bar is bilingual.
function OnboardingProgressBar({ status }: { status: OnboardingStatus }) {
  const ts = useTranslations("onboarding.stage");
  const p = onboardingProgress(status?.stage, status?.status);
  const label = ts.has(p.stageKey) ? ts(p.stageKey) : p.label;
  const summary = onboardingCountsSummary(status?.counts);
  return (
    <div className="w-64 max-w-full">
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className={p.error ? "text-red-600" : "text-ink"}>{label}</span>
        {!p.error && <span className="tabular-nums text-ink-muted">{p.percent}%</span>}
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-line">
        <div
          className={`h-full rounded-full transition-all duration-500 ${p.error ? "bg-red-500" : "bg-brand-600"}`}
          style={{ width: `${p.error ? 100 : p.percent}%` }}
        />
      </div>
      {summary && <p className="mt-1 text-xs text-ink-muted">{summary}</p>}
    </div>
  );
}

export function RunOnboardingButton({ advocateId, label }: { advocateId: string; label: string }) {
  const t = useTranslations("onboarding");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState("");
  const [prog, setProg] = useState<OnboardingStatus>(null);
  const router = useRouter();
  const stopRef = useRef(false);
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  // WO-58/WO-61: the live roster refresh is async — the rotating-IP fleet ingests the advocate's full
  // roster into our warehouse over the following minutes. Poll the warehouse harvest so those cases land
  // in the account WITHOUT a manual re-run (a cold advocate was the blackhole). Bounded + self-terminating.
  const harvest = async () => {
    let empty = 0;
    for (let i = 0; i < 8 && empty < 2 && mounted.current; i++) {
      await new Promise((r) => setTimeout(r, 5000));
      if (!mounted.current) return;
      let added = 0;
      try { added = (await harvestOnboarding(advocateId)).added; } catch { /* transient — keep trying */ }
      if (added > 0) { empty = 0; if (mounted.current) { setMsg(t("background.arrived", { n: added })); router.refresh(); } }
      else empty++;
    }
  };

  const run = () =>
    start(async () => {
      setMsg("");
      setProg(null);
      stopRef.current = false;
      // Poll the run record while startOnboarding executes server-side, so the bar shows real progress.
      const poll = (async () => {
        while (!stopRef.current) {
          try {
            const st = await getOnboardingStatus(advocateId);
            if (st && st.status === "running") setProg(st);   // ignore a stale prior run until it's live
          } catch { /* transient — keep polling */ }
          await new Promise((r) => setTimeout(r, 1500));
        }
      })();
      try {
        let r = await startOnboarding(advocateId);
        if (mounted.current) setMsg(r.message);
        // BP-73: on Vercel Hobby a server action is capped at 60s, so `startOnboarding` runs only the
        // first ~45s chunk. A large roster comes back `done:false` — keep calling `continueOnboarding`
        // (each another bounded chunk) until it finishes, so enrichment/deadlines/AI actually complete
        // instead of dying at the cap. Guarded against an unbounded loop; stops on unmount/stop.
        let guard = 0;
        while (r.ok && r.done === false && r.runId && !stopRef.current && mounted.current && guard < 40) {
          guard++;
          r = await continueOnboarding(r.runId);
          if (mounted.current) setMsg(r.message);
        }
      } catch {
        // A bounded drain shouldn't hit the 60s cap, but network/transient errors can still reject. The
        // cases seeded by completed stages are already persisted — never let the rejection reach the error
        // boundary ("Something went wrong" crashes the page). Show a graceful, localized note; the daily
        // cron backstop (or a re-run) finishes any run left mid-flight.
        setMsg(t("timeout"));
      } finally {
        stopRef.current = true;
        await poll;
        setProg(null);
        router.refresh();
        void harvest();   // background: pull in cases as the async fleet lands them (WO-58)
      }
    });

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <button onClick={run} disabled={pending} className="btn-primary">
          <Icon name={pending ? "refresh" : "sparkles"} className={`h-4 w-4 ${pending ? "animate-spin" : ""}`} />{" "}
          {pending ? t("running") : label}
        </button>
        {pending && prog && <OnboardingProgressBar status={prog} />}
      </div>
      {msg && <span className="max-w-md text-xs text-ink-muted">{msg}</span>}
    </div>
  );
}

// WO-61: the persistent "still gathering in the background" state — the fix for the blackhole where a
// WORKING async pipeline read as "0 cases". Shown (server decides via `isGathering`) whenever the fleet
// is still landing the advocate's roster: a calm banner that says the user can leave, plus a manual
// "check for new cases" and a bounded auto-poll that seeds arrivals + refreshes. Survives page revisits
// (unlike the post-run-only harvest) — so a user who onboarded, left, and came back sees progress, not zero.
export function OnboardingBackground({ advocateId }: { advocateId: string }) {
  const t = useTranslations("onboarding.background");
  const [pending, start] = useTransition();
  const [arrived, setArrived] = useState(0);
  const router = useRouter();
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  const check = () =>
    start(async () => {
      try {
        const { added } = await harvestOnboarding(advocateId);
        if (added > 0 && mounted.current) { setArrived((n) => n + added); router.refresh(); }
      } catch { /* transient */ }
    });

  // Gentle auto-poll on mount (and on revisit) — bounded, unmount-safe, no live eCourts burst (warehouse read).
  useEffect(() => {
    let stop = false;
    (async () => {
      for (let i = 0; i < 6 && !stop && mounted.current; i++) {
        await new Promise((r) => setTimeout(r, 6000));
        if (stop || !mounted.current) return;
        try {
          const { added } = await harvestOnboarding(advocateId);
          if (added > 0 && mounted.current) { setArrived((n) => n + added); router.refresh(); }
        } catch { /* transient */ }
      }
    })();
    return () => { stop = true; };
  }, [advocateId, router]);

  return (
    <div className="mt-3 flex flex-wrap items-start gap-3 rounded-xl border border-brand-100 bg-brand-50/60 px-4 py-3">
      <Icon name="refresh" className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-brand-600" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-brand-800">{t("title")}</p>
        <p className="mt-0.5 text-xs text-ink-muted">{t("body")}</p>
        {arrived > 0 && <p className="mt-1 text-xs font-medium text-emerald-700">{t("arrived", { n: arrived })}</p>}
      </div>
      <button onClick={check} disabled={pending} className="btn-secondary shrink-0 text-xs">
        {pending ? t("checking") : t("check")}
      </button>
    </div>
  );
}

// Undo an onboarding: removes the advocate + their onboarded cases via the shared two-step inline
// confirm (WO-61 — replaces the native window.confirm/alert). deleteOnboarding returns {ok,message}.
export function DeleteOnboardingButton({ advocateId, label, confirmText }: { advocateId: string; label: string; confirmText: string }) {
  return (
    <ConfirmDelete
      action={deleteOnboarding}
      id={advocateId}
      label={label}
      confirmLabel={label}
      note={confirmText}
    />
  );
}
