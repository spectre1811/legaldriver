// WO-358 W1 — fallback notice composition extracted from cron/notify/route.ts.
import { renderNotice, type RenderedEmail } from "@/lib/email/templates";
import { matterIdOf, appUrl, type CaseUpdatePayload } from "@/lib/notify/email-render";
import { caseDetailHref } from "@/lib/court/case-links";
import { brand } from "@/lib/brand";
import en from "@/i18n/messages/en.json";

type DigestCase = { title?: string; cnr?: string; itemNo?: string; type?: string; judge?: string };

// Per-kind masthead category + "why you got this" line (EN-only catalog copy). A fallback notice
// must label itself by what it IS — a notice_escalation is not a "Deadline" and must not promise a
// deadline subscription. Unknown kinds fall to the neutral default, never another kind's label.
const NOTICE_CAT = en.emailNotice.category as Record<string, string>;
const NOTICE_WHY = en.emailNotice.why as Record<string, string>;

export function noticeCopyForKind(kind: string): { category: string; why: string } {
  return {
    category: NOTICE_CAT[kind] ?? NOTICE_CAT.default,
    why: NOTICE_WHY[kind] ?? NOTICE_WHY.default,
  };
}

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
  const { category, why } = noticeCopyForKind(kind);
  return renderNotice(subjectForKind(kind, p), lines, appUrl(ctaPath), "Open " + brand.name, category, why);
}

// The fallback subject, per kind. A missing slot falls back to an honest SHORTER subject — never an
// empty-slot sentence ("Deadline:  due ") and never a faked value ("case"/"your case"/"tomorrow").
export function subjectForKind(kind: string, p: { title?: string; eventDate?: string; count?: number }) {
  if (kind === "hearing_reminder") {
    if (p.title && p.eventDate) return `Hearing reminder: ${p.title} on ${p.eventDate}`;
    if (p.title) return `Hearing reminder: ${p.title}`;
    if (p.eventDate) return `Hearing reminder on ${p.eventDate}`;
    return "Hearing reminder";
  }
  if (kind === "deadline_reminder") {
    // §04: "Deadline {eventDate}: {title}" — e.g. "Deadline 18 Aug: Written submissions — Sharma v. State".
    if (p.eventDate && p.title) return `Deadline ${p.eventDate}: ${p.title}`;
    if (p.eventDate) return `Deadline ${p.eventDate}`;
    if (p.title) return `Deadline: ${p.title}`;
    return "Deadline";
  }
  if (kind === "notice_escalation") return p.title ? `Notice escalated: ${p.title}` : "Notice escalated";
  if (kind === "case_update") return p.title ? `Case update: ${p.title}` : "Case update";
  if (kind === "cause_list_digest") {
    const n = p.count ?? 0;
    const noun = n === 1 ? "case" : "cases";
    return p.eventDate ? `Cause list: ${n} ${noun} listed ${p.eventDate}` : `Cause list: ${n} ${noun}`;
  }
  return `${brand.name} notification`;
}
