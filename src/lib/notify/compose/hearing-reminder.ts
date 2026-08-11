// WO-358 W1 — hearing reminder composition extracted from cron/notify/route.ts.
import { renderEmail, type RenderedEmail } from "@/lib/email/templates";
import { hearingWhenLabel, istFriendlyDate, matterIdOf, appUrl, type CaseUpdatePayload } from "@/lib/notify/email-render";
import { caseDetailHref } from "@/lib/court/case-links";

export function composeHearingReminderEmail(p: CaseUpdatePayload & { courtNo?: string }): RenderedEmail | null {
  const matterId = matterIdOf(p);

  const when = hearingWhenLabel(p.eventDate ?? ""); // caller already skipped null (stale)
  if (!when) return null;

  // WO-314: {when} alone never said WHEN — add the actual date, court number, and stage.
  return renderEmail(
    "hearingReminder",
    {
      when,
      case: p.title,
      court: p.court,
      cnr: p.cnr,
      purpose: p.purpose,
      date: p.eventDate ? istFriendlyDate(p.eventDate) : undefined,
      courtNo: (p as Record<string, unknown>).courtNo as string | undefined,
      stage: p.stage,
    },
    appUrl(p.cnr || matterId ? caseDetailHref(p.cnr ?? "", matterId) : "/dashboard/calendar"),
  );
}
