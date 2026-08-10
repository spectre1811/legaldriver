"use client";

// WO-338 · the reference's page-top toggle (design-mockups/iteration3/console/onboarding.tsx —
// `gathering ? <GatheringCard/> : <AddAdvocateCard/>`) driven by REAL data instead of a demo
// boolean: `activeAssembling` (server-computed in page.tsx from the most-recently-updated
// `onboarding_run` that's still `status: "running"`) replaces the mockup's local `gathering`
// useState. "Add a different Bar ID" doesn't reset that run (it keeps assembling in the
// background — its own roster row below tracks it live); it just lets the advocate move on to
// adding another one, mirroring the mock's `onReset` intent for our real multi-advocate model.
//
// WO-349 WAVE-3 · the reference's card CTA reads "Assemble practice", but this card renders the
// SAME <AdvocateForm> Settings uses — its default button copy ("Add & fetch my cases") stays
// correct for Settings, so this passes an explicit `ctaLabel` override rather than forking or
// renaming the shared component's own string (ui-pipeline: change a shared primitive once, don't
// fork it — a label prop is the parameterization, not a fork). FLAGGED deviation: the reference's
// heading is literally "Your entire practice, assembled from your Bar ID.", but "your entire
// practice" is a hard-locked, CI-enforced retired line (WO-202 W2 — a TM-collision marketing line
// purged from the copy-deck; `npm run guard:copy` fails the build on it). Compliance copy is
// founder-gated, not this WO's to override, so `dashboard.onboarding.lead.addTitle` keeps its
// pre-existing honest paraphrase ("Your whole practice…") instead of the reference's exact words.
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/icons";
import { AdvocateForm } from "../settings/advocate-form";

export type LeadChecklistItem = { key: string; label: string; state: "done" | "running" | "todo" };
export type ActiveAssembling = {
  runId: string;
  bar: string;
  councilLabel: string | null;
  percent: number;
  checklist: LeadChecklistItem[];
};

export function OnboardingLead({
  centered,
  activeAssembling,
}: {
  centered: boolean;
  activeAssembling: ActiveAssembling | null;
}) {
  const td = useTranslations("dashboard.onboarding");
  const t = useTranslations("dashboard.onboarding.lead");
  const [dismissedRunId, setDismissedRunId] = useState<string | null>(null);

  if (activeAssembling && activeAssembling.runId !== dismissedRunId) {
    const a = activeAssembling;
    return (
      <div className="ec-card p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="ec-label">{t("assembling")}</div>
            <div className="font-display mt-1 truncate text-[20px] text-ec-ink">{a.bar}</div>
            {a.councilLabel && <div className="num mt-0.5 font-mono text-[11.5px] text-ec-ink-3">{a.councilLabel}</div>}
          </div>
          <span className="num font-display text-[20px] text-ec-bronze">{a.percent}%</span>
        </div>

        <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-ec-paper-3">
          <div className="h-full rounded-full bg-ec-bronze transition-all duration-700 motion-reduce:transition-none" style={{ width: `${a.percent}%` }} />
        </div>

        <ul className="mt-5 space-y-2.5">
          {a.checklist.map((c, i) => (
            <li key={c.key} className="stagger flex items-center gap-2.5 text-[13px]" style={{ animationDelay: `${i * 140}ms` }}>
              {c.state === "done" ? (
                <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-ec-bronze text-white">
                  <Icon name="check" className="h-2.5 w-2.5" />
                </span>
              ) : c.state === "running" ? (
                <Icon name="refresh" className="h-3.5 w-3.5 shrink-0 animate-spin text-ec-honey motion-reduce:animate-none" />
              ) : (
                <span className="h-4 w-4 shrink-0 rounded-full border border-ec-hair-strong" />
              )}
              <span className={c.state === "todo" ? "text-ec-ink-3" : "text-ec-ink-2"}>{c.label}</span>
            </li>
          ))}
        </ul>

        <p className="mt-4 text-[12.5px] text-ec-ink-3">
          {t("leaveHint")}{" "}
          <button type="button" onClick={() => setDismissedRunId(a.runId)} className="text-ec-bronze hover:underline">
            {t("reset")}
          </button>
          .
        </p>
      </div>
    );
  }

  return (
    <div className={`ec-card p-6 ${centered ? "mx-auto max-w-lg text-center" : ""}`}>
      <div className="ec-label">{td("addEyebrow")}</div>
      <h2 className="font-display mt-2 text-[22px] leading-snug text-ec-ink">{t("addTitle")}</h2>
      {centered && <p className="mt-2 text-[13px] text-ec-ink-3">{t("addBody")}</p>}
      <div className={`mt-5 ${centered ? "text-left" : ""}`}>
        <AdvocateForm ctaLabel={t("assembleCta")} />
      </div>
    </div>
  );
}
