// WO-83 · case-links contract. Pure + offline (no network/DB). Asserts the rule that lets a listed
// case be *browsed* before it's tracked: a tracked case links to its matter page (with the AI
// briefing); an untracked case links to the read-only CNR preview (no AI). Run: npx tsx tests/wo83_case_links.ts
import { caseDetailHref, normalizeCnr } from "@/lib/court/case-links";

let ok = true;
const eq = (label: string, got: unknown, want: unknown) => {
  const pass = got === want;
  if (!pass) ok = false;
  console.log(`${pass ? "✓" : "✗"} ${label}${pass ? "" : `  got=${JSON.stringify(got)} want=${JSON.stringify(want)}`}`);
};

const CNR = "GJHC010012345202X";

// Tracked → the tracked matter page is canonical (AI briefing + tools live there).
eq("tracked → matter page", caseDetailHref(CNR, "matter-uuid-1"), "/dashboard/cases/matter-uuid-1");

// Untracked → the read-only CNR preview (AI summary is gated behind tracking).
eq("untracked (undefined) → preview", caseDetailHref(CNR), `/dashboard/cases/cnr/${CNR}`);
eq("untracked (null) → preview", caseDetailHref(CNR, null), `/dashboard/cases/cnr/${CNR}`);
eq("untracked (empty id) → preview", caseDetailHref(CNR, ""), `/dashboard/cases/cnr/${CNR}`);

// CNR is normalized (upper + trimmed) and URL-encoded in the preview href.
eq("lowercased+spaced CNR normalizes", caseDetailHref("  gjhc010012345202x  "), `/dashboard/cases/cnr/${CNR}`);
eq("normalizeCnr upper+trim", normalizeCnr("  abcd/12  "), "ABCD/12");
// A slash-form id (district CNR/case number) is percent-encoded so the route param is intact.
eq("slash is encoded in href", caseDetailHref("G/12/2020"), "/dashboard/cases/cnr/G%2F12%2F2020");

console.log(ok ? "WO83 CASE LINKS: PASS" : "WO83 CASE LINKS: FAIL");
process.exit(ok ? 0 : 1);
