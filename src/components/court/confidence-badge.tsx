// BP-17 · ConfidenceBadge — makes "how sure are we this is the right record/person" legible
// wherever a fuzzy match is shown (search, causelist "listed but not tracked", dossier name
// resolution). NEW: the audit found 0 confidence rendering anywhere. Bands follow the FG-3
// thresholds (logic.ts). An optional `onConfirm` turns it into a review-queue affordance.
import { confidenceBand, confidenceTone, chipToneClass, type ConfidenceBand } from "./logic";

const DEFAULT_TEXT: Record<ConfidenceBand, string> = {
  high: "high confidence",
  medium: "needs review",
  low: "low confidence",
};

export function ConfidenceBadge({
  score,
  band,
  labels,
  showScore = true,
  className = "",
}: {
  /** 0–1 (or 0–100) match score. */
  score?: number;
  /** Or pass the band directly. */
  band?: ConfidenceBand;
  /** Override copy per band (e.g. next-intl strings). */
  labels?: Partial<Record<ConfidenceBand, string>>;
  /** Append the numeric score as a tooltip when a score is given. */
  showScore?: boolean;
  className?: string;
}) {
  const b = confidenceBand(band ?? score ?? 0);
  const text = labels?.[b] ?? DEFAULT_TEXT[b];
  const pct = typeof score === "number" && Number.isFinite(score) ? Math.round((score > 1 ? score : score * 100)) : null;
  return (
    <span
      className={`${chipToneClass(confidenceTone(b))} ${className}`.trim()}
      title={showScore && pct != null ? `match confidence ${pct}%` : undefined}
    >
      {text}
      {showScore && pct != null && <span className="num ml-1 opacity-70">{pct}%</span>}
    </span>
  );
}
