"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { startOnboarding, deleteOnboarding, getOnboardingStatus, harvestOnboarding, type OnboardingStatus } from "./actions";
import { onboardingProgress, onboardingCountsSummary } from "@/lib/services/onboarding/progress";

// BP-71 W2: a live progress bar over the real onboarding_run record (stage + counts), so the user sees
// "Fetching your cases… · 12 cases on file" instead of an opaque spinner. Renders the pure
// `onboardingProgress` mapping; honest — it reflects the stages the orchestrator actually completed.
function OnboardingProgressBar({ status }: { status: OnboardingStatus }) {
  const p = onboardingProgress(status?.stage, status?.status);
  const summary = onboardingCountsSummary(status?.counts);
  return (
    <div className="w-64 max-w-full">
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className={p.error ? "text-red-600" : "text-ink"}>{p.label}</span>
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
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState("");
  const [prog, setProg] = useState<OnboardingStatus>(null);
  const router = useRouter();
  const stopRef = useRef(false);
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  // WO-58: the live roster refresh is async — the rotating-IP fleet ingests the advocate's full roster
  // into our warehouse over the following minutes. Poll the warehouse harvest so those cases land in the
  // account WITHOUT a manual re-run (a cold advocate was the blackhole). Bounded + self-terminating:
  // stops after two consecutive empty passes, and never touches state after the component unmounts.
  const harvest = async () => {
    let empty = 0;
    for (let i = 0; i < 8 && empty < 2 && mounted.current; i++) {
      await new Promise((r) => setTimeout(r, 5000));
      if (!mounted.current) return;
      let added = 0;
      try { added = (await harvestOnboarding(advocateId)).added; } catch { /* transient — keep trying */ }
      if (added > 0) { empty = 0; if (mounted.current) { setMsg((m) => `${m} · +${added} more just arrived`); router.refresh(); } }
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
        const r = await startOnboarding(advocateId);
        setMsg(r.message);
      } catch {
        // The onboarding server action can be KILLED by Vercel's 60s function cap (Hobby) on a long run
        // (large roster → the per-CNR enrich stage). The cases seeded by the EARLY stages are already
        // persisted — so never let the action's rejection propagate to the error boundary ("Something
        // went wrong" crashes the whole page). Show a graceful note and refresh to surface what landed.
        setMsg("Still assembling your practice — this can take a moment on a large roster. We'll keep going in the background; refresh to see what's ready.");
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
          {pending ? "Running…" : label}
        </button>
        {pending && prog && <OnboardingProgressBar status={prog} />}
      </div>
      {msg && <span className="max-w-md text-xs text-ink-muted">{msg}</span>}
    </div>
  );
}

// Undo an onboarding: removes the advocate + their onboarded cases (confirm first).
export function DeleteOnboardingButton({ advocateId, label, confirmText }: { advocateId: string; label: string; confirmText: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <button
      onClick={() => {
        if (!window.confirm(confirmText)) return;
        start(async () => { const r = await deleteOnboarding(advocateId); if (r.message) window.alert(r.message); router.refresh(); });
      }}
      disabled={pending}
      className="text-xs text-ink-muted underline-offset-2 hover:text-red-600 hover:underline disabled:opacity-50"
    >
      {pending ? "Removing…" : label}
    </button>
  );
}
