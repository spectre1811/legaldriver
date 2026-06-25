// Pure parser for a court "daily cause list" — text (already extracted from the
// advocate-supplied PDF) → structured entries. No DB, no I/O. Cause-list layouts
// vary wildly across courts/registries, so this is deliberately defensive: it
// anchors on the one stable token (the 16-char CNR) and best-effort associates a
// hearing date + item/serial number found nearby. Returns whatever is confidently
// extractable; callers verify against the official record.

export interface CauseListEntry {
  cnr: string;
  date?: string; // normalised YYYY-MM-DD
  itemNo?: string;
  court?: string;
}

// CNR (Case Number Record): 16 alphanumerics, conventionally 2-4 leading letters
// (state+establishment code) then digits/letters. We keep the window 12-18 to be
// tolerant of slightly off OCR/extraction while still avoiding random words.
// Require digits (eCourts CNR = 4 letters + 12 digits) so we don't match plain
// uppercase words; a slightly looser digit-bearing fallback keeps OCR tolerance.
const CNR_RE = /\b[A-Z]{4}\d{12}\b|\b[A-Z]{2,4}\d{8,14}\b/g;

// Date forms seen on cause lists: 01-02-2026 / 01/02/2026 / 1.2.2026 / "1 Feb 2026"
const NUMERIC_DATE_RE = /\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})\b/;
const TEXT_DATE_RE = /\b(\d{1,2})\s+([A-Za-z]{3,9})\.?\s+(\d{4})\b/;

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

// Normalise a date fragment to YYYY-MM-DD, or undefined if it isn't a sane date.
function normaliseDate(fragment: string): string | undefined {
  const numeric = fragment.match(NUMERIC_DATE_RE);
  if (numeric) {
    const day = Number(numeric[1]);
    const month = Number(numeric[2]);
    const year = Number(numeric[3]);
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12 && year >= 1900 && year <= 2100) {
      return `${year}-${pad(month)}-${pad(day)}`;
    }
    return undefined;
  }
  const text = fragment.match(TEXT_DATE_RE);
  if (text) {
    const day = Number(text[1]);
    const month = MONTHS[text[2].toLowerCase().slice(0, text[2].toLowerCase().startsWith("sept") ? 4 : 3)];
    const year = Number(text[3]);
    if (month && day >= 1 && day <= 31 && year >= 1900 && year <= 2100) {
      return `${year}-${pad(month)}-${pad(day)}`;
    }
  }
  return undefined;
}

// Find a date in a line (numeric form preferred, text form fallback).
function findDate(line: string): string | undefined {
  const numeric = line.match(NUMERIC_DATE_RE);
  if (numeric) {
    const d = normaliseDate(numeric[0]);
    if (d) return d;
  }
  const text = line.match(TEXT_DATE_RE);
  if (text) return normaliseDate(text[0]);
  return undefined;
}

// Item / serial number: a leading "Item No. 12", "Sl. No 12", "12." or a bare
// leading integer at the start of the line. Kept conservative to avoid matching
// digits inside the CNR or dates.
function findItemNo(line: string): string | undefined {
  const labelled = line.match(/\b(?:item|sl|serial|sr|s)\.?\s*(?:no\.?)?\s*[:.]?\s*(\d{1,4})\b/i);
  if (labelled) return labelled[1];
  const leading = line.match(/^\s*(\d{1,4})[).\s]/);
  if (leading) return leading[1];
  return undefined;
}

// Court / bench hint, e.g. "Court No. 5", "COURT NO.- 12", "Hon'ble Court 3".
function findCourt(line: string): string | undefined {
  const m = line.match(/\bcourt\s*(?:no\.?|number)?\s*[:.\-]?\s*(\d{1,3})\b/i);
  if (m) return `Court ${m[1]}`;
  return undefined;
}

export function parseCauseList(text: string): CauseListEntry[] {
  if (!text || !text.trim()) return [];
  const lines = text.split(/\r?\n/);

  // Index of which line each CNR occurrence sits on, so we can look at adjacent
  // lines for an associated date / item / court when they aren't on the same line.
  const byCnr = new Map<string, CauseListEntry>();
  let currentCourt: string | undefined;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Track the most recent court header — cause lists group items under a bench.
    const courtOnLine = findCourt(line);
    if (courtOnLine && !CNR_RE.test(line)) currentCourt = courtOnLine;
    CNR_RE.lastIndex = 0;

    const cnrs = line.match(CNR_RE);
    if (!cnrs) continue;

    // Build a small window (prev, this, next) to scavenge associated fields.
    const prev = lines[i - 1] ?? "";
    const next = lines[i + 1] ?? "";
    const window = `${prev}\n${line}\n${next}`;

    const date = findDate(line) ?? findDate(window);
    const itemNo = findItemNo(line) ?? findItemNo(prev);
    const court = findCourt(line) ?? courtOnLine ?? currentCourt;

    for (const rawCnr of cnrs) {
      const cnr = rawCnr.toUpperCase();
      const existing = byCnr.get(cnr);
      const candidate: CauseListEntry = { cnr, date, itemNo, court };
      if (!existing) {
        byCnr.set(cnr, candidate);
      } else {
        // Dedupe keeping the most complete record: fill gaps from later sightings,
        // but never overwrite a value we already confidently captured.
        existing.date = existing.date ?? candidate.date;
        existing.itemNo = existing.itemNo ?? candidate.itemNo;
        existing.court = existing.court ?? candidate.court;
      }
    }
  }

  return [...byCnr.values()];
}
