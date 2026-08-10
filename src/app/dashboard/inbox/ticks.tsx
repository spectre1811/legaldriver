"use client";

import { useTranslations } from "next-intl";
import { confidenceBand, type ConfidenceBand } from "@/lib/mail/inbox-status";

const LEVEL: Record<ConfidenceBand, 1 | 2 | 3> = { low: 1, medium: 2, high: 3 };

// WO-335 · the Chambers reference's <Ticks> confidence indicator (3 bronze bars + a mono label),
// re-derived from the REAL confidence band (lib/mail/inbox-status.ts) instead of the reference's
// dummy 1|2|3 literal. The exact percent (when the classifier has scored the email) rides along
// as the accessible title/aria so real precision isn't lost behind the coarser 3-tick visual.
export function Ticks({ confidence, threshold }: { confidence: number | null; threshold: number }) {
  const t = useTranslations("dashboard.inbox");
  const tOld = useTranslations("inbox");
  const unrated = confidence == null;
  const band = confidenceBand(confidence, threshold);
  const level = unrated ? 0 : LEVEL[band];
  const label = unrated ? tOld("confidence.unrated") : t(`ticks.${band}`);
  const title = unrated ? label : `${label} · ${tOld("confidence.value", { percent: Math.round(confidence * 100) })}`;
  return (
    <span className="inline-flex items-center gap-1.5" title={title}>
      <span className="flex gap-[3px]" aria-hidden="true">
        {[1, 2, 3].map((i) => (
          <span key={i} className={`h-2.5 w-[3px] rounded-full ${i <= level ? "bg-ec-bronze" : "bg-ec-line"}`} />
        ))}
      </span>
      <span className="ec-mono-label">{label}</span>
    </span>
  );
}
