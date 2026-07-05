"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { startOnboarding, deleteOnboarding, getOnboardingStatus, type OnboardingStatus } from "./actions";
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
      const r = await startOnboarding(advocateId);
      stopRef.current = true;
      await poll;
      setProg(null);
      setMsg(r.message);
      router.refresh();
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
