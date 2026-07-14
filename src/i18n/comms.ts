// Communications catalog (comms-catalog-v2) rendering helpers.
//
// Every catalog string is a template with `{slot}`s that bind to REAL data only
// (copy-deck §8 honesty rule). If a slot has no real value, the sentence has no
// business existing — we drop it rather than fake a value. These two functions
// are the single enforcement point for that rule; components and the styleguide
// both render through them, never by hand-interpolating strings.

export type Slot = string | number | null | undefined;

const SLOT = /\{(\w+)\}/g;

const missing = (v: Slot): boolean => v === null || v === undefined || v === "";

/**
 * Fill `{slots}` in a single-sentence template. Returns the interpolated string,
 * or `null` when any referenced slot is missing — the caller drops the sentence
 * instead of showing a half-real one. Templates with no slots always render.
 */
export function fillTemplate(template: string, data: Record<string, Slot> = {}): string | null {
  for (const [, key] of template.matchAll(SLOT)) {
    if (missing(data[key])) return null;
  }
  return template.replace(SLOT, (_, key: string) => String(data[key]));
}

/**
 * Fill a multi-line template (WhatsApp board, email body) line by line, dropping
 * only the lines whose slots are missing. If every line drops, fall back to
 * `emptyVariant` (e.g. the board's "Diary is clear." line) so the message is
 * still honest and never blank-by-accident.
 */
export function fillLines(template: string, data: Record<string, Slot> = {}, emptyVariant = ""): string {
  const kept: string[] = [];
  for (const line of template.split("\n")) {
    const filled = fillTemplate(line, data);
    if (filled !== null) kept.push(filled);
  }
  return kept.length ? kept.join("\n") : emptyVariant;
}
