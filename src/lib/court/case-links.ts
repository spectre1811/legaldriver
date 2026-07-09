// WO-83 · Where a case row links to.
//
// Before WO-83 a case in a judge/advocate/lookup listing was reachable ONLY after you
// tracked it (the CNR linked to `/dashboard/cases/{matterId}`, which exists post-track);
// an untracked case had a "Track" button and no way to just *look* at it. WO-83 makes
// every listed case a hyperlink to its details:
//   • already tracked  → the full tracked matter page (with the AI briefing),
//   • not yet tracked  → the read-only CNR preview (`/dashboard/cases/cnr/{cnr}`) that
//     mirrors the eCourts record minus the AI summary, and carries the Track button.
//
// Pure + framework-free so the four listing surfaces derive the href identically (no drift)
// and the trust contract is unit-tested (tests/wo83_case_links.ts).

/** Canonical CNR form used in the preview URL (matches trackCaseByCnr's sanitisation). */
export function normalizeCnr(cnr: string): string {
  return (cnr ?? "").trim().toUpperCase();
}

/**
 * The details href for a listed case.
 * @param cnr      the case's CNR (from the live corpus).
 * @param matterId the tenant's tracked-matter id for this CNR, if any.
 */
export function caseDetailHref(cnr: string, matterId?: string | null): string {
  if (matterId) return `/dashboard/cases/${matterId}`;
  return `/dashboard/cases/cnr/${encodeURIComponent(normalizeCnr(cnr))}`;
}
