// WO-57 · Near-term entity-variant collapsing for the Cases advocate/act facets.
//
// The Cases facet filters on the RAW `matter.advocate_names[]` / `act_names[]` strings and the
// dropdown is built from those same raw strings, so one real advocate/act fragments across
// spelling variants that differ ONLY by honorific / punctuation / whitespace / case — and the
// exact-match filter under-returns. Founder-flagged, live: `P R PATEL` (31) vs `P.R.PATEL` (1)
// is one advocate split by punctuation; the facet showed two entries and selecting either
// returned only that variant's cases.
//
// The full fix is canonical entity resolution (BP-03 `advocate_canonical`, shipped in the
// scraper warehouse); until those canonical ids reach the tenant `matter` rows this collapses
// the surface-only variants into ONE facet option whose match expands back to every raw variant.
// `.overlaps` (SQL `&&`) is any-of, so submitting all variants returns the whole entity's cases
// with no query-builder change.
//
// It deliberately does NOT merge initial-vs-fullname (`Y J PATEL` ≠ `YASH J PATEL`) — that needs
// the BP-03 cluster and must never be guessed here (a false merge is a data-correctness incident).

// Leading tokens that are titles/honorifics on an advocate name, never part of the identity.
const ADVOCATE_HONORIFICS = new Set([
  "MR", "MRS", "MS", "MISS", "M/S", "DR", "SHRI", "SRI", "SMT", "ADV", "ADVOCATE",
  "KUM", "KUMARI", "PROF", "SARVASHRI", "SARVASRI",
]);

// Case-fold, turn separating punctuation into spaces, collapse whitespace. Shared base for both
// facets. `.` and `,` only ever separate in these names (`P.R.PATEL`, "Penal Code, 1860"), so
// mapping them to a space (not deletion) keeps token boundaries: `P.R` → `P R`, never `PR`.
function collapse(s: string): string {
  return s
    .toUpperCase()
    .replace(/[.,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Advocate key: collapse + strip a leading run of honorific tokens. Keeps at least one token
// (a name that is only honorifics is degenerate — leave it as-is rather than key to "").
export function advocateKey(s: string): string {
  const tokens = collapse(s).split(" ").filter(Boolean);
  let i = 0;
  while (i < tokens.length - 1 && ADVOCATE_HONORIFICS.has(tokens[i])) i++;
  return tokens.slice(i).join(" ");
}

// Act key: casing / punctuation / whitespace only (no honorifics). Acts store full names, so the
// only near-term drift is surface (`Indian Penal Code, 1860` vs `INDIAN PENAL CODE,1860`);
// merging `IPC` ↔ `Indian Penal Code` needs the BP-05 act dictionary, out of near-term scope.
export function actKey(s: string): string {
  return collapse(s);
}

export interface FacetGroup {
  label: string; // display representative — the richest raw spelling
  values: string[]; // every raw variant → the expanded `.overlaps` match set
}

// The Console encodes a group's raw variants into a single option value with this separator and
// splits it back out on select. U+001F (unit separator) is a control char that never occurs in a
// name/act, so it can't collide with real data or the URL's own delimiters.
export const GROUP_SEP = String.fromCharCode(0x1f);

// Group raw distinct strings by their normalized key (blanks skipped). The label is the "richest"
// raw variant — most alphanumerics, then longest, then lexical — so the dropdown shows the fullest
// spelling. Groups are sorted by label for a stable dropdown order.
export function groupFacet(raw: string[], key: (s: string) => string): FacetGroup[] {
  const groups = new Map<string, string[]>();
  for (const r of raw) {
    const v = (r ?? "").trim();
    if (!v) continue;
    const k = key(v);
    if (!k) continue;
    const g = groups.get(k);
    if (g) {
      if (!g.includes(v)) g.push(v);
    } else {
      groups.set(k, [v]);
    }
  }
  const alnum = (s: string) => (s.match(/[a-z0-9]/gi) ?? []).length;
  const richest = (vs: string[]) =>
    [...vs].sort((a, b) => alnum(b) - alnum(a) || b.length - a.length || a.localeCompare(b))[0];
  return [...groups.values()]
    .map((vs) => ({ label: richest(vs), values: [...vs].sort() }))
    .sort((a, b) => a.label.localeCompare(b.label));
}
