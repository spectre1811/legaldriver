// BP-17 · Shared court-data component kit — canonical source. Pure/prop-driven, `ec-*`-tokened,
// next-intl-safe (copy comes in as props). peshi-search consumes the identical folder (BP-18 picks
// the distribution mechanism). Every court field should render through one of these — no page
// hand-rolls a chip, a "—", or a date parse.
//
// Four-state contract (charter AC7): a court field renders through EXACTLY ONE of
//   { populated → CourtChip/CodeLabel/plain, EmptyCell, DirtyValue, MaskedName }
// via <CourtField>, enforced by construction (logic.ts resolveFieldState).

// Pure logic (also directly importable for non-render uses / tests)
export * from "./logic";

// Primitives & four-state cells
export { CourtChip } from "./court-chip";
export { EmptyCell } from "./empty-cell";
export { DirtyValue } from "./dirty-value";
export { MaskedName } from "./masked-name";
export { CourtField } from "./court-field";

// Net-new signals
export { ConfidenceBadge } from "./confidence-badge";
export { PendencyAge } from "./pendency-age";
export { StalenessBanner } from "./staleness-banner";
export { InterpretationBadge } from "./interpretation-badge";

// Dates, provenance, disclaimer, notices
export { CourtDate } from "./court-date";
export { ProvenanceChip } from "./provenance-chip";
export { Disclaimer } from "./disclaimer";
export { NoticeBanner } from "./notice-banner";

// Folded-in existing components (canonical home is now here)
export { CodeLabel, type CodeLabelValue } from "./code-label";
export { HearingTimeline, type TimelineEventLike } from "./timeline";
// NOTE: CourtProviderBanner is NOT re-exported here — it's app-bound (reads the legaldriver
// provider config + next-intl/server) and would poison this pure/portable barrel. It lives at
// "@/components/court-provider-banner" and renders through the kit's NoticeBanner.
