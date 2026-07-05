// BP-17 · InterpretationBadge — labels a hearing/order as substantive vs adjourned. This is OUR
// reading, not a court fact, so it is ALWAYS visually distinct (a chip, never inline with the
// record) and carries its confidence. NEW. Charter: never present an interpretation as a record.
import { interpretationTone, confidenceBand, type InterpretationLabel } from "./logic";
import { CourtChip } from "./court-chip";

const DEFAULT_TEXT: Record<InterpretationLabel, string> = {
  substantive: "substantive",
  adjourned: "adjourned",
  uncertain: "unclear",
};

export function InterpretationBadge({
  label,
  confidence,
  labels,
  className = "",
}: {
  label: InterpretationLabel;
  /** 0–1 confidence in this interpretation; shown as a tooltip and low-conf visual cue. */
  confidence?: number;
  labels?: Partial<Record<InterpretationLabel, string>>;
  className?: string;
}) {
  const text = labels?.[label] ?? DEFAULT_TEXT[label];
  // Low confidence in a non-uncertain label → downgrade tone to neutral so we never look sure when
  // we aren't; the tooltip carries the number.
  const lowConf = typeof confidence === "number" && confidenceBand(confidence) === "low";
  const tone = lowConf ? "neutral" : interpretationTone(label);
  const pct = typeof confidence === "number" && Number.isFinite(confidence) ? Math.round(confidence > 1 ? confidence : confidence * 100) : null;
  return (
    <CourtChip tone={tone} className={`italic ${className}`.trim()}>
      <span title={pct != null ? `interpreted, ${pct}% confidence` : "our interpretation, not a court record"}>
        {text}
        {pct != null && <span className="num ml-1 opacity-70">{pct}%</span>}
      </span>
    </CourtChip>
  );
}
