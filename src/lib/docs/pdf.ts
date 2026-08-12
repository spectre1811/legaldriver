// WO-411 · a tiny, zero-dependency PDF writer for short text documents (case-file style exports).
//
// Why hand-rolled: the repo's one existing "PDF" surface (invoices' [id]/print/page.tsx) is
// actually a browser Print-to-PDF page, not a real binary — fine for that flow, but "Export as
// PDF" needs an actual downloadable file. The only real options were add a headless-Chromium
// dependency (puppeteer/playwright — a heavy new runtime binary for one export button, and this
// repo already keeps `playwright` dev-only, un-shipped) or a PDF-authoring package (pdfkit/
// jspdf — a new dependency + package-lock churn across every worktree). Mirrors zip.ts's existing
// precedent instead: hand-roll the (simple) binary format, zero dependencies, fully unit-tested.
//
// PDF ref: ISO 32000-1 §7 — header, a flat object table, an xref table with exact byte offsets,
// and a trailer pointing at the Catalog. Base-14 Helvetica/Helvetica-Bold only (no font
// embedding), ASCII-only text (see escapeText's ponytail note for the ceiling that leaves) via
// the base text operators (BT/ET, Tf, Tm, Tj) — no images, no embedded fonts, no compression.

export type PdfBlockKind = "h1" | "h2" | "label" | "text" | "muted" | "rule" | "space";
export interface PdfBlock {
  kind: PdfBlockKind;
  text?: string;
}

const PAGE_W = 595.28; // A4, points
const PAGE_H = 841.89;
const MARGIN = 50;
const CONTENT_W = PAGE_W - MARGIN * 2;

const STYLE: Record<Exclude<PdfBlockKind, "rule" | "space">, { size: number; bold: boolean; gray: number; before: number; after: number }> = {
  h1: { size: 18, bold: true, gray: 0, before: 0, after: 10 },
  h2: { size: 12.5, bold: true, gray: 0.12, before: 14, after: 6 },
  label: { size: 9, bold: true, gray: 0.35, before: 4, after: 1 },
  text: { size: 10, bold: false, gray: 0.05, before: 0, after: 3 },
  muted: { size: 8.5, bold: false, gray: 0.45, before: 2, after: 2 },
};

// ponytail: base-14 Helvetica has no Devanagari glyphs, so any character outside printable ASCII
// (0x20-0x7E) is either mapped to its closest ASCII look-alike or dropped to "?". A Hindi party/
// court name would render as "?" runs — a real ceiling, not silently "supported". Upgrade path:
// embed a Unicode TTF (a real new dependency + font subsetting) if localized PDFs are ever asked
// for; the read-only share view (case-file-data consumer, rendered as HTML) has no such limit.
const ASCII_MAP: Record<string, string> = {
  "–": "-", "—": "-", "‘": "'", "’": "'", "“": '"', "”": '"',
  "…": "...", "•": "-", "₹": "Rs.",
};
function toAscii(s: string): string {
  let out = "";
  for (const ch of s) {
    for (const c of ASCII_MAP[ch] ?? ch) {
      const code = c.codePointAt(0) ?? 63;
      out += code >= 0x20 && code <= 0x7e ? c : "?";
    }
  }
  return out;
}
function escapePdfString(s: string): string {
  return toAscii(s).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

// ponytail: naive fixed-average-glyph-width wrap (Helvetica average ≈ 0.52x font size), not real
// AFM metrics — good enough for case-file prose; upgrade to measured widths if wrap ever visibly
// misjudges at demo scale.
function wrapLine(text: string, size: number, bold: boolean): string[] {
  const avgW = size * (bold ? 0.56 : 0.52);
  const maxChars = Math.max(10, Math.floor(CONTENT_W / avgW));
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length) return [""];
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (next.length > maxChars && cur) {
      lines.push(cur);
      cur = w;
    } else {
      cur = next;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

interface Line { text: string; size: number; bold: boolean; gray: number; gapBefore: number; gapAfter: number }

function layout(blocks: PdfBlock[]): Line[] {
  const lines: Line[] = [];
  for (const b of blocks) {
    if (b.kind === "space") {
      lines.push({ text: "", size: 6, bold: false, gray: 0, gapBefore: 0, gapAfter: 8 });
      continue;
    }
    if (b.kind === "rule") {
      lines.push({ text: "-".repeat(90), size: 6, bold: false, gray: 0.75, gapBefore: 4, gapAfter: 8 });
      continue;
    }
    const style = STYLE[b.kind];
    const wrapped = wrapLine(b.text ?? "", style.size, style.bold);
    wrapped.forEach((t, i) => {
      lines.push({
        text: t,
        size: style.size,
        bold: style.bold,
        gray: style.gray,
        gapBefore: i === 0 ? style.before : 0,
        gapAfter: i === wrapped.length - 1 ? style.after : style.size * 0.25,
      });
    });
  }
  return lines;
}

interface Placed { text: string; y: number; size: number; bold: boolean; gray: number }

// Absolute text-matrix placement per line (Tm, not relative Td) — simplest way to paginate
// correctly without tracking cumulative text-position drift across a page break.
function paginate(lines: Line[]): Placed[][] {
  const pages: Placed[][] = [[]];
  let y = PAGE_H - MARGIN;
  for (const line of lines) {
    const lineH = line.size * 1.25;
    y -= line.gapBefore;
    if (y - lineH < MARGIN) {
      pages.push([]);
      y = PAGE_H - MARGIN;
    }
    if (line.text) pages[pages.length - 1].push({ text: line.text, y, size: line.size, bold: line.bold, gray: line.gray });
    y -= lineH + line.gapAfter;
  }
  return pages;
}

function contentStreamFor(page: Placed[]): string {
  const ops: string[] = [];
  for (const p of page) {
    ops.push(`${p.bold ? "/F2" : "/F1"} ${p.size} Tf`);
    ops.push(`${p.gray} g`);
    ops.push(`1 0 0 1 ${MARGIN} ${p.y.toFixed(2)} Tm (${escapePdfString(p.text)}) Tj`);
  }
  return `BT\n${ops.join("\n")}\nET`;
}

/** Build a complete, minimal multi-page PDF from a flat block list. */
export function buildPdf(blocks: PdfBlock[]): Uint8Array<ArrayBuffer> {
  const pages = paginate(layout(blocks));
  const enc = new TextEncoder();

  // Object numbering: 1 Catalog, 2 Pages, 3 Font(regular), 4 Font(bold), then a Page/Content
  // pair per output page.
  const pageCount = pages.length;
  const pageObjNums = pages.map((_, i) => 5 + i * 2);
  const contentObjNums = pages.map((_, i) => 6 + i * 2);
  const total = 4 + pageCount * 2;

  const objects: string[] = new Array(total + 1).fill("");
  objects[1] = `<< /Type /Catalog /Pages 2 0 R >>`;
  objects[2] = `<< /Type /Pages /Kids [${pageObjNums.map((n) => `${n} 0 R`).join(" ")}] /Count ${pageCount} >>`;
  objects[3] = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`;
  objects[4] = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>`;
  pages.forEach((page, i) => {
    objects[pageObjNums[i]] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentObjNums[i]} 0 R >>`;
    const stream = contentStreamFor(page);
    objects[contentObjNums[i]] = `<< /Length ${enc.encode(stream).length} >>\nstream\n${stream}\nendstream`;
  });

  const chunks: Uint8Array[] = [];
  const offsets: number[] = new Array(total + 1).fill(0);
  let offset = 0;
  const push = (s: string) => {
    const b = enc.encode(s);
    chunks.push(b);
    offset += b.length;
  };

  push("%PDF-1.4\n");
  for (let n = 1; n <= total; n++) {
    offsets[n] = offset;
    push(`${n} 0 obj\n${objects[n]}\nendobj\n`);
  }
  const xrefOffset = offset;
  push(`xref\n0 ${total + 1}\n0000000000 65535 f \n`);
  for (let n = 1; n <= total; n++) push(`${String(offsets[n]).padStart(10, "0")} 00000 n \n`);
  push(`trailer\n<< /Size ${total + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);

  const out = new Uint8Array(offset);
  let p = 0;
  for (const c of chunks) {
    out.set(c, p);
    p += c.length;
  }
  return out;
}
