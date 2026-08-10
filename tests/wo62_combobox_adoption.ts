// WO-62 · Modern combobox adoption sweep. Guards that the app doesn't reintroduce a raw
// native `<select>` over a long / DB-derived list — those must use the shared WO-55
// `<Combobox>`/`<MultiSelect>` (searchable, scrollable, a11y). WO-55's primitive alone
// changed nothing; this sweep swapped the picker/filter/form surfaces.
//
// STRUCTURAL/source guard (the primitive's own logic is covered by tests/wo55_combobox.ts).
// The rule (LEARNINGS "Never ship a raw native <select> for a long/DB-derived list"): a native
// <select> is allowed ONLY for a tiny fixed enum with no search/multi need. So we keep an
// explicit ALLOWLIST of the files that may still contain a native <select>, each with the
// reason. Any NEW file that introduces a raw <select> trips this test → forces the author to
// either use the Combobox or justify a new allowlist entry.
// Run: npx tsx tests/wo62_combobox_adoption.ts
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

let failures = 0;
const check = (name: string, cond: boolean) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}`);
  if (!cond) failures++;
};

const root = join(__dirname, "..");
const srcDir = join(root, "src");

// Recursively collect every .tsx under src/ and flag those containing a native `<select`.
function walk(dir: string, out: string[]) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith(".tsx")) out.push(p);
  }
}
const files: string[] = [];
walk(srcDir, files);
const rel = (p: string) => p.slice(root.length + 1).replaceAll("\\", "/");

// The ONLY files permitted to still render a native <select>, with the justification.
// Two categories: (a) tiny fixed enums where search/multi add nothing; (b) the compact
// dark bulk-bar action-triggers that need a Combobox `onDark`/compact skin variant first
// (tracked in BACKLOG §D "WO-62 combobox adoption — remaining sweep").
const ALLOWLIST = new Set<string>([
  "src/components/pagination.tsx",                    // page-size 25/50/100 — fixed enum
  "src/app/dashboard/cases/cases-pagination.tsx",      // WO-331: Cases' own pager, same page-size 25/50/100 fixed enum
  // clients/client-intake.tsx dropped (WO-201 W2): type → Segmented, practice_area_id → Combobox; no raw <select> remains.
  "src/app/dashboard/ip/ip-form.tsx",                // IP asset type — fixed enum
  "src/app/dashboard/cases/[id]/time-expense.tsx",   // expense category — fixed enum
  "src/app/dashboard/calendar/add-entry.tsx",        // entry kind — fixed enum (matter picker IS a Combobox)
  "src/app/dashboard/assistant/draft/draft-ui.tsx",  // output language — fixed enum
  "src/app/dashboard/documents/documents-browser.tsx", // dark bulk-bar action-trigger — needs onDark variant (§D)
  "src/app/dashboard/cases/cases-table.tsx",         // dark bulk-bar set-stage action-trigger — needs onDark variant (§D)
]);

// The primitive itself renders no native <select> (it wraps Headless UI).
const COMBOBOX_DIR = "src/components/combobox/";

const offenders = files
  .filter((p) => /<select[\s>]/.test(readFileSync(p, "utf8")))
  .map(rel)
  .filter((r) => !r.startsWith(COMBOBOX_DIR) && !ALLOWLIST.has(r));

check(
  `no un-allowlisted native <select> remains${offenders.length ? " — offenders: " + offenders.join(", ") : ""}`,
  offenders.length === 0,
);

// Positive adoption proof: the flagship + a representative picker consume the Combobox.
// WO-289: judgments/filters.tsx dropped off this list — the Athena→order-text migration retired
// the court/year/disposal Combobox facets (the endpoint has no server-side filter support for
// them), leaving a single plain-text search input (the same pattern as the directory page's own
// search box, which never used Combobox either — a text input isn't a picker).
const ADOPTED = [
  "src/app/dashboard/cases/cases-toolbar.tsx",
  "src/app/dashboard/documents/filter-bar.tsx",
  "src/app/dashboard/inbox/inbox-workspace.tsx",
  "src/app/dashboard/calendar/add-entry.tsx",
  "src/app/dashboard/notices/notice-form.tsx",
  "src/app/dashboard/clients/client-intake.tsx",
];
for (const f of ADOPTED) {
  const s = readFileSync(join(root, f), "utf8");
  check(`${f} imports the shared Combobox`, /from ["']@\/components\/combobox["']/.test(s) && /<Combobox\b/.test(s));
}

// Form pickers that swapped a `<select name=…>` must keep a hidden input carrying the value
// into FormData (else the controlled Combobox silently drops the field on submit).
const HIDDEN_INPUT_FORMS: { file: string; name: string }[] = [
  { file: "src/app/dashboard/calendar/add-entry.tsx", name: "matter_id" },
  { file: "src/app/dashboard/notices/notice-form.tsx", name: "matter_id" },
  { file: "src/app/dashboard/voice/uploader.tsx", name: "client_id" },
  { file: "src/app/dashboard/clients/client-intake.tsx", name: "practice_area_id" },
];
for (const { file, name } of HIDDEN_INPUT_FORMS) {
  const s = readFileSync(join(root, file), "utf8");
  const hasHidden = new RegExp(`type="hidden"[^>]*name="${name}"|name="${name}"[^>]*type="hidden"`).test(s);
  // The swapped picker must no longer be a native <select name=…> (a sibling fixed-enum
  // <select> like calendar's `kind` may legitimately remain — only THIS field must be gone).
  const swappedSelectGone = !new RegExp(`<select[^>]*name="${name}"`).test(s);
  check(`${file}: hidden input preserves "${name}" for FormData`, hasHidden && swappedSelectGone);
}

console.log(failures === 0 ? "\nWO62 COMBOBOX ADOPTION: PASS" : `\nWO62 COMBOBOX ADOPTION: FAIL (${failures})`);
process.exit(failures === 0 ? 0 : 1);
