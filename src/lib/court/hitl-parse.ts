import type { NormalizedCase, NormalizedParty } from "./types";

// Parse the text a human captured from an official eCourts case page (via the
// bookmarklet). Defensive + label-based: eCourts layouts vary, so we extract what
// we can confidently and leave the rest. The CNR is the key — without it we can't
// file. This is the deterministic "parse what the human brought back" step.

const titleCase = (s: string) => s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()).replace(/\s+/g, " ").trim();

// dd-mm-yyyy | dd/mm/yyyy | "8th August 2026" | yyyy-mm-dd → yyyy-mm-dd
function toIso(raw: string): string | null {
  const s = raw.trim();
  let m = s.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/\b(\d{1,2})[-/](\d{1,2})[-/](\d{4})\b/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
  m = s.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+),?\s+(\d{4})\b/);
  if (m) {
    const mi = MONTHS.indexOf(m[2].toLowerCase());
    if (mi >= 0) return `${m[3]}-${String(mi + 1).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  return null;
}

// Value after a label on the same line, e.g. "Next Hearing Date : 08-08-2026".
function afterLabel(lines: string[], label: RegExp): string | undefined {
  for (const line of lines) {
    const m = line.match(label);
    if (m) {
      const rest = line.slice((m.index ?? 0) + m[0].length).replace(/^[:\s-]+/, "").trim();
      if (rest) return rest;
    }
  }
  return undefined;
}

// Names listed under a section header (e.g. "Petitioner and Advocate") until the
// next known header. Strips leading "1)" and "Advocate-..." suffixes.
function namesUnder(lines: string[], header: RegExp, stops: RegExp): string[] {
  const out: string[] = [];
  let on = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (header.test(line)) { on = true; continue; }
    if (on) {
      if (stops.test(line) || !line) { if (out.length) break; else continue; }
      const cleaned = line.replace(/^\d+\)\s*/, "").split(/advocate\s*[-:]/i)[0].replace(/[—-]\s*$/, "").trim();
      if (cleaned && cleaned.length > 1 && !/^under\b/i.test(cleaned)) out.push(cleaned);
    }
  }
  return out;
}

export interface HitlResult {
  ok: boolean;
  reason?: string;
  normalized?: NormalizedCase;
}

// ── Cause-list capture ───────────────────────────────────────────────────────
// A cause-list page has no CNRs — it lists case NUMBERS (e.g. CC/9744/2007), the
// parties (X versus Y) and the advocate, all for one hearing date. We parse those
// rows so the capture can match them to the firm's cases and update hearing dates.
export interface CauseListEntry {
  caseNumber: string; // e.g. CC/9744/2007
  regNo: string;      // e.g. 9744/2007
  parties: string[];  // non-generic party names (the accused etc.)
  advocate?: string;
}
export interface CauseListResult {
  listDate: string | null;
  entries: CauseListEntry[];
}

const GENERIC_PARTY = /^(the\s+)?(state(\s+of\s+\w+)?|union\s+of\s+india|govt|government|app|public\s+prosecutor|n\/a|versus|vs)\.?$/i;
const CASE_NO_RE = /\b([A-Z]{1,6})\s*\/\s*(\d{1,7})\s*\/\s*(\d{4})\b/g;

function firstDate(text: string): string | null {
  // Prefer a date near a "date"/"cause list" label; else the first plausible date.
  const near = text.match(/(?:cause\s*list|list\s*date|dated?)\D{0,20}(\d{1,2}[-/]\d{1,2}[-/]\d{4}|\d{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]+,?\s+\d{4})/i);
  const any = text.match(/\b\d{1,2}[-/]\d{1,2}[-/]\d{4}\b/);
  return toIso(near?.[1] ?? any?.[0] ?? "");
}

export function parseEcourtsCauseList(text: string): CauseListResult {
  const clean = (text || "").replace(/\r/g, "");
  const matches = [...clean.matchAll(CASE_NO_RE)];
  if (!matches.length) return { listDate: null, entries: [] };

  const entries: CauseListEntry[] = [];
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const caseNumber = `${m[1].toUpperCase()}/${m[2]}/${m[3]}`;
    const regNo = `${m[2]}/${m[3]}`;
    const start = (m.index ?? 0) + m[0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index ?? clean.length : Math.min(clean.length, start + 400);
    // Strip the next row's leading "N  View" cells that bleed into this segment.
    let segment = clean.slice(start, end).replace(/\s*\d{1,4}\s*\n?\s*view\s*$/i, " ");
    // Drop obvious noise tokens (View buttons, section columns) before name extraction.
    segment = segment.replace(/\bview\b/gi, " ").replace(/\b(?:crpc|cr\.?p\.?c|ipc|bns|bnss|bsa)\b[\s.\-]*\d+/gi, " ");

    // Split parties on "versus"/"v/s"/"vs"; pull the most name-like phrase from each side.
    const vsplit = segment.split(/\bversus\b|\bv\/s\b|\bvs\.?\b/i);
    const cleanName = (s: string) =>
      s.split("\n").map((x) => x.trim())
        .filter((x) => x && !/^\d+$/.test(x) && !GENERIC_PARTY.test(x))
        .map((x) => x.replace(/[^A-Za-z .&'-]/g, " ").replace(/\s+/g, " ").trim())
        .filter((x) => x.length > 2)
        .sort((a, b) => b.length - a.length)[0];
    const parties: string[] = [];
    for (const side of vsplit.slice(0, 2)) {
      const nm = cleanName(side);
      if (nm && !GENERIC_PARTY.test(nm)) parties.push(titleCase(nm));
    }
    entries.push({ caseNumber, regNo, parties: [...new Set(parties)] });
  }
  // Dedupe by case number.
  const seen = new Set<string>();
  const deduped = entries.filter((e) => (seen.has(e.caseNumber) ? false : (seen.add(e.caseNumber), true)));
  return { listDate: firstDate(clean), entries: deduped };
}

export function parseEcourtsCapture(text: string): HitlResult {
  const clean = (text || "").replace(/\r/g, "");
  const lines = clean.split("\n").map((l) => l.trim()).filter(Boolean);

  // eCourts CNR = 4 letters + 12 digits (e.g. GJAH220924142026). Require digits so
  // we don't grab words like "REGISTRATION"; fall back to a digit-bearing token.
  const up = clean.toUpperCase();
  const cnr = (up.match(/\b[A-Z]{4}\d{12}\b/) ?? up.match(/\b[A-Z]{2,4}\d{8,14}\b/))?.[0];
  if (!cnr) return { ok: false, reason: "No CNR found — make sure you're on an eCourts case-details page." };

  const nextRaw = afterLabel(lines, /next\s+(?:hearing\s+)?date/i) ?? afterLabel(lines, /next\s+date/i);
  const nextHearingDate = nextRaw ? toIso(nextRaw) : null;

  const petStop = /^(respondent|acts?|case\s+status|orders?|fir|first\s+hearing|next\s+hearing|stage)/i;
  const resStop = /^(acts?|case\s+status|orders?|fir|first\s+hearing|next\s+hearing|stage|petitioner)/i;
  const petitioners = namesUnder(lines, /petitioner/i, petStop);
  const respondents = namesUnder(lines, /respondent/i, resStop);

  const parties: NormalizedParty[] = [
    ...petitioners.map((p) => ({ name: titleCase(p), side: "petitioner" as const })),
    ...respondents.map((p) => ({ name: titleCase(p), side: "respondent" as const })),
  ];

  const caseType = afterLabel(lines, /case\s+type/i);
  const stage = afterLabel(lines, /stage\s+of\s+case/i) ?? afterLabel(lines, /stage/i);
  const status = afterLabel(lines, /case\s+status/i);
  const court = afterLabel(lines, /court\s+(?:number\s+and\s+judge|name|establishment)/i) ?? afterLabel(lines, /district\s+court/i);
  const acts = namesUnder(lines, /^acts?\b/i, /^(orders?|case\s+history|fir|petitioner|respondent)/i).map(titleCase);

  const pet0 = petitioners[0] ? titleCase(petitioners[0]) : "";
  const res0 = respondents[0] ? titleCase(respondents[0]) : "";
  const title = pet0 && res0 ? `${pet0} v. ${res0}` : cnr;

  const normalized: NormalizedCase = {
    cnr: cnr.toUpperCase(),
    title,
    court,
    caseType,
    stage,
    status,
    parties,
    nextHearingDate,
    hearings: nextHearingDate ? [{ date: nextHearingDate, purpose: "Next hearing (captured)" }] : [],
    orders: [],
    acts,
    judges: [],
    detail: { capturedFromPortal: true },
    source: "ecourts-hitl",
    fetchedAt: new Date().toISOString(),
  };
  return { ok: true, normalized };
}
