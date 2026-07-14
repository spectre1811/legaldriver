// BP-17 · StalenessBanner — warns when court data is older than the freshness SLO. NEW (the
// charter requires it; none existed). The SLO number itself is FG-8 — the caller passes `sloHours`;
// the kit only compares (logic.ts `stalenessState`). Renders nothing while fresh, so it's safe to
// drop on every court card. Uses the shared NoticeBanner shell.
import { stalenessState, relativeAge } from "./logic";
import { NoticeBanner } from "./notice-banner";

export function StalenessBanner({
  lastSyncedAt,
  sloHours,
  now,
  label,
  className = "",
}: {
  lastSyncedAt: string | null | undefined;
  sloHours: number;
  now?: Date;
  /** Override copy (e.g. a next-intl string). Default composes an English message with the age. */
  label?: string;
  className?: string;
}) {
  const s = stalenessState(lastSyncedAt, sloHours, now);
  if (!s.stale) return null;
  const text =
    label ??
    (s.ageHours == null
      ? "This record has not been refreshed yet — verify against the official record."
      : `This record was last refreshed ${relativeAge(lastSyncedAt, now)} — it may be out of date; verify against the official record.`);
  return (
    <NoticeBanner tone="warn" className={`text-xs ${className}`.trim()}>
      {text}
    </NoticeBanner>
  );
}
