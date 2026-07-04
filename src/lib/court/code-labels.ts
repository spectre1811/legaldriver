// WO-32 · One source of truth for expanding cryptic eCourts codes → full human-readable names.
//
// Sourcing (NEVER guess — information-integrity §): the case-type master is DERIVED from the live
// corpus, which self-labels its own expansions (see code-labels.source.csv + gen-code-labels.mjs).
// disposal_nature is parsed deterministically from its embedded description. Advocate-role terms
// (APP/PP/AGP/GP) are the standard Indian court prosecution/State-counsel abbreviations, confirmed
// against the corpus (single "advocates" named APP/PP with 10k–360k cases = a role, not a person).
//
// Every UI surface expands via this module — no per-page maps (no drift).
import { CASE_TYPE_MASTER } from "./code-labels.data";

export type CodeKind = "caseType" | "disposal" | "advocateRole" | "purpose";

export interface Expanded {
  /** Full human name to show as primary (falls back to the raw code when unknown). */
  full: string;
  /** The original short code, to show muted/secondary and as a `title`. */
  code: string;
  /** True when a sourced expansion was found; false → the raw code is shown (flagged, not faked). */
  known: boolean;
  /** For advocate roles: this "name" is a role/office, not an individual person. */
  isRole?: boolean;
}

// ── casing ─────────────────────────────────────────────────────────────────
// The corpus stores full names in ALL CAPS ("CRIMINAL CASE"). Title-case for display while keeping
// genuine acronyms intact. Rules (applied per whitespace token):
//   1. no letters (numbers/symbols)           → keep verbatim  ("(2)", "-")
//   2. token contains a digit                 → keep verbatim  ("33C", "Rule-26A")
//   3. token is a known multi-letter acronym  → keep verbatim  (NDPS, JMFC, FH …)
//   4. dotted initialism (segments ≤2 chars)  → keep verbatim  (I.T.C., P.W., E.S.I.)
//   5. lowercase stopword (not the 1st word)  → lowercase      ("of", "as", "at")
//   6. otherwise                              → title-case each letter-run ("MISC.APPLICATION"→"Misc.Application")
// The acronym set holds only tokens observed in the corpus's full-name text that are NOT common
// English words — 2-letter word-homographs (AS/IT/IN…) are deliberately excluded so they read as words.
const ACRONYMS = new Set([
  "NDPS", "PMLA", "PCSO", "ATRO", "ACB", "GCTOC", "GLGP", "GPID", "CBI", "RERA", "MAC",
  "JMFC", "ESI", "IESO", "RLY", "FH", "PW", "WC", "NI",
]);
const STOPWORDS = new Set([
  "a", "an", "and", "as", "at", "by", "for", "from", "in", "of", "on", "or", "per", "the", "to", "under", "with",
]);
const capSeg = (seg: string) => seg.charAt(0).toUpperCase() + seg.slice(1).toLowerCase();
const isInitialism = (w: string) => {
  if (!w.includes(".")) return false;
  const segs = w.split(/[^A-Za-z]+/).filter(Boolean);
  return segs.length >= 2 && segs.every((s) => s.length <= 2);
};

export function smartTitleCase(s: string): string {
  return s
    .trim()
    .split(/\s+/)
    .map((w, i) => {
      if (!/[A-Za-z]/.test(w)) return w;
      if (/\d/.test(w)) return w;
      if (ACRONYMS.has(w.replace(/[^A-Za-z0-9]/g, "").toUpperCase())) return w;
      if (isInitialism(w)) return w;
      if (i > 0 && STOPWORDS.has(w.toLowerCase())) return w.toLowerCase();
      // title-case each letter-run, but keep a lone letter after an apostrophe lowercase (possessive "’s")
      return w.replace(/[A-Za-z]+/g, (seg, idx: number) =>
        seg.length === 1 && idx > 0 && /['’]/.test(w[idx - 1]) ? seg.toLowerCase() : capSeg(seg));
    })
    .join(" ");
}

// Normalize a case-type code so punctuation/spacing variants collapse (matches gen-code-labels.mjs).
const normCode = (c: string) => c.toUpperCase().replace(/[.\-\s]+/g, " ").trim();

// ── case_type ────────────────────────────────────────────────────────────────
// Prefer the self-describing string ("CC - CRIMINAL CASE", "CR.A(CRIMINAL APPEAL)-43"); else the
// corpus-derived master (tier-scoped, then any); else keep the raw code (known:false → flagged).
export function expandCaseType(raw?: string | null, tier?: string | null): Expanded {
  const code = (raw ?? "").trim();
  if (!code) return { full: "", code: "", known: false };

  // 1. district self-label "CODE - Full" (tried first; district fulls may end in "(...)")
  const dc = code.match(/^(.+?)\s-\s(.+)$/);
  if (dc) return { full: smartTitleCase(dc[2].trim()), code: dc[1].trim(), known: true };
  // 2. HC self-label "CODE(FULL)-NN" (code has no parens)
  const hc = code.match(/^([^()]+?)\((.+)\)(?:-\d+)?$/);
  if (hc) return { full: smartTitleCase(hc[2].trim()), code: hc[1].trim(), known: true };

  // 3. bare code → corpus master (tier-scoped, then any-tier)
  const key = normCode(code);
  const t = (tier ?? "").toUpperCase();
  const full = (t && CASE_TYPE_MASTER[t]?.[key]) || CASE_TYPE_MASTER.ANY?.[key];
  if (full) return { full: smartTitleCase(full), code, known: true };

  // 4. unknown → raw code, flagged (never fabricate)
  return { full: code, code, known: false };
}

// ── disposal_nature ───────────────────────────────────────────────────────────
// Corpus format: "{contest}--{code}-{DESCRIPTION}" e.g. "Contested--56-DISPOSED AT ADMISSION STAGE".
// The DESCRIPTION is embedded — parse it out deterministically (no master, no guessing).
export interface DisposalExpanded extends Expanded {
  /** "Contested" / "Uncontested" / undefined — the contest nature prefix. */
  contest?: string;
}
export function expandDisposal(raw?: string | null): DisposalExpanded {
  const s = (raw ?? "").trim();
  if (!s) return { full: "", code: "", known: false };
  const m = s.match(/^([^-]*)--(?:(\d+)-)?(.*)$/);
  if (m) {
    const contest = m[1].trim();
    const num = m[2] ?? "";
    const desc = m[3].trim();
    if (desc) {
      const full = contest ? `${smartTitleCase(contest)} — ${smartTitleCase(desc)}` : smartTitleCase(desc);
      return { full, code: num || s, contest: contest || undefined, known: true };
    }
    if (contest) return { full: smartTitleCase(contest), code: num || s, contest, known: true };
  }
  // plain value (e.g. "DISPOSED", "Allowed") — just tidy the casing
  return { full: smartTitleCase(s), code: s, known: true };
}

// ── advocate role-as-entity ───────────────────────────────────────────────────
// Standard Indian-court State-counsel/prosecution role abbreviations. These are NOT individual
// advocates — a single "advocate" named APP carries 360k cases. We expand the well-established
// ones and always flag them as a ROLE (isRole). DGP is intentionally NOT expanded (ambiguous:
// District Government Pleader vs Director-General of Police) — flagged as a role, kept raw.
export const ADVOCATE_ROLES: Record<string, string> = {
  APP: "Additional Public Prosecutor",
  PP: "Public Prosecutor",
  "PUBLIC PROSECUTOR": "Public Prosecutor",
  AGP: "Assistant Government Pleader",
  GP: "Government Pleader",
};
const AMBIGUOUS_ROLES = new Set(["DGP"]); // known office, uncertain expansion → flag, don't guess

export function advocateRole(name?: string | null): { isRole: boolean; full?: string; raw: string } {
  const raw = (name ?? "").trim();
  const key = raw.toUpperCase();
  if (key in ADVOCATE_ROLES) return { isRole: true, full: ADVOCATE_ROLES[key], raw };
  if (AMBIGUOUS_ROLES.has(key)) return { isRole: true, raw };
  return { isRole: false, raw };
}

// ── hearing purpose / stage ───────────────────────────────────────────────────
// Corpus purposes are already descriptive but carry HTML-entity artifacts ("&amp;", "&#039;").
// Decode + tidy casing; no expansion needed (nothing to guess).
export function cleanPurpose(raw?: string | null): string {
  const s = (raw ?? "").trim();
  if (!s) return "";
  const decoded = s
    .replace(/&amp;/g, "&")
    .replace(/&#0?39;|&#x27;|&apos;/g, "’")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
  return smartTitleCase(decoded);
}

// ── one dispatcher (the WO's single expandCode helper) ─────────────────────────
export function expandCode(kind: CodeKind, code?: string | null, ctx?: { tier?: string | null }): Expanded {
  switch (kind) {
    case "caseType":
      return expandCaseType(code, ctx?.tier);
    case "disposal":
      return expandDisposal(code);
    case "purpose": {
      const full = cleanPurpose(code);
      return { full, code: (code ?? "").trim(), known: Boolean(full) };
    }
    case "advocateRole": {
      const r = advocateRole(code);
      return { full: r.full ?? r.raw, code: r.raw, known: Boolean(r.full), isRole: r.isRole };
    }
  }
}
