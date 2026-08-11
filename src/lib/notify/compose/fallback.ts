// WO-358 W1 — fallback notice composition extracted from cron/notify/route.ts.
import { renderNotice, type RenderedEmail } from "@/lib/email/templates";
import { matterIdOf, appUrl, type CaseUpdatePayload } from "@/lib/notify/email-render";
import { caseDetailHref } from "@/lib/court/case-links";
import { brand } from "@/lib/brand";

type DigestCase = { title?: string; cnr?: string; itemNo?: string; type?: string; judge?: string };

// Fallback: generic branded notice from the real payload (deadline_reminder,
// notice_escalation, legacy in-flight cause_list_digest rows, legacy case_update).
export function composeFallbackNotice(
  kind: string,
  p: CaseUpdatePayload & { body?: string; count?: number; cases?: DigestCase[] },
): RenderedEmail | null {
  const matterId = matterIdOf(p);

  const lines: { text: string; role?: "lead" | "muted" }[] = [];
  if (kind === "cause_list_digest" && p.cases?.length) {
    lines.push({ text: `These tracked cases are listed on ${p.eventDate ?? "the next court day"}:`, role: "lead" });
    for (const c of p.cases) {
      const detail = [c.itemNo ? `Item ${c.itemNo}` : null, c.type, c.judge].filter(Boolean).join(" · ");
      lines.push({ text: `${c.title ?? c.cnr ?? "Case"}${c.cnr ? ` (${c.cnr})` : ""}${detail ? ` — ${detail}` : ""}` });
    }
  } else if (p.body) {
    lines.push({ text: p.body, role: "lead" });
  } else {
    lines.push({ text: `Open ${brand.name} to view details.`, role: "lead" });
  }
  const ctaPath = kind === "cause_list_digest" ? "/dashboard/calendar" : matterId || p.cnr ? caseDetailHref(p.cnr ?? "", matterId) : "/dashboard";
  return renderNotice(subjectForKind(kind, p), lines, appUrl(ctaPath), "Open " + brand.name);
}

export function subjectForKind(kind: string, p: { title?: string; eventDate?: string; count?: number }) {
  if (kind === "hearing_reminder") return `Hearing reminder: ${p.title ?? "case"} on ${p.eventDate ?? ""}`;
  if (kind === "deadline_reminder") return `Deadline: ${p.title ?? ""} due ${p.eventDate ?? ""}`;
  if (kind === "notice_escalation") return `Notice escalated: ${p.title ?? ""}`;
  if (kind === "case_update") return `Case update: ${p.title ?? "your case"}`;
  if (kind === "cause_list_digest") {
    const n = p.count ?? 0;
    return `Cause list: ${n} case${n === 1 ? "" : "s"} listed ${p.eventDate ?? "tomorrow"}`;
  }
  return `${brand.name} notification`;
}
