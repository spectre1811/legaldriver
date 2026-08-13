// WO-358 W1 — caseUpdate roundup composition extracted from cron/notify/route.ts.
// The roundup groups a tenant's due caseUpdate rows, composes one email, and
// marks siblings for joint flipping.
import { composeCaseUpdate, appUrl, type CaseUpdatePayload } from "@/lib/notify/email-render";
import { renderEmail, type RenderedEmail } from "@/lib/email/templates";
import type { NotifyRow } from "@/lib/notify/pickup";
import type { DeadRefFilter } from "@/lib/notify/filter/dead-refs";

// WO-264 · caseUpdate roundup ("tight per-user roundup, avoid spam"): all of a
// tenant's due caseUpdate email rows in this run fold into ONE email. The first
// row the loop reaches is the subject-bearer; siblings are folded + flipped with it.
// Dead-ref rows never join a group — a vanished matter must not ride into a roundup.
export function buildCaseUpdateRoundup(
  rows: NotifyRow[],
  isDeadRef: DeadRefFilter["isDeadRef"],
): Map<string, { id: string; payload: CaseUpdatePayload }[]> {
  const group = new Map<string, { id: string; payload: CaseUpdatePayload }[]>();
  for (const n of rows) {
    if (n.channel === "email" && n.kind === "case_update" && !isDeadRef(n.payload)) {
      const list = group.get(n.tenant_id) ?? group.set(n.tenant_id, []).get(n.tenant_id)!;
      list.push({ id: n.id, payload: n.payload as unknown as CaseUpdatePayload });
    }
  }
  return group;
}

// WO-414 · the disposal notice is a `case_update` variant — bound off the existing
// closed-set change label until WO-415 lands the structured payload.disposal flag (which
// replaces this single check). The notification kind stays `case_update`.
export const DISPOSAL_CHANGE_LABEL = "No next date on record";

// Compose one caseUpdate email for a group of rows. Returns null for legacy rows
// without a change label — caller falls back to renderNotice.
export function composeCaseUpdateEmail(
  p: CaseUpdatePayload,
  group?: CaseUpdatePayload[],
): RenderedEmail | null {
  const composed = composeCaseUpdate(group && group.length ? group : [p]);
  if (!composed) return null;
  const key = composed.data.change === DISPOSAL_CHANGE_LABEL ? "disposalNotice" : "caseUpdate";
  return renderEmail(key, composed.data, appUrl(composed.ctaPath));
}

// Whether a roundup actually composed (siblings may only be flipped when the
// roundup composed — a null compose falls back to a single-row notice that does
// NOT carry the siblings' content).
// (review finding, PR#192; unreachable today, cheap to make impossible).
export function roundupComposed(group: { payload: CaseUpdatePayload }[]): boolean {
  return group.length > 1 && composeCaseUpdate(group.map((g) => g.payload)) !== null;
}
