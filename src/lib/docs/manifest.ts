// WO-27 Wave 3 — the export "register": a CSV index shipped inside the export zip so an advocate
// has a filable record of what was exported and how each document was filed. Pure + testable.

export type ManifestRow = {
  filename: string;
  docType: string | null;
  category: string | null;
  client: string | null;
  matter: string | null;
  source: string | null;
  sizeBytes: number | null;
  added: string | null; // ISO or display string
};

// RFC-4180 field escaping + CSV formula-injection defence. A value starting with = + - @ (or a
// tab/CR) is executed as a formula by Excel/LibreOffice, and filename/client/matter are
// user-controllable (e.g. a Gmail attachment named `=HYPERLINK(...)` is stored raw), so we prefix
// a single quote to force it to plain text. Then quote per RFC-4180 if it holds a comma/quote/newline.
function csvField(value: string): string {
  let v = value;
  if (/^[=+\-@\t\r]/.test(v)) v = "'" + v;
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

const HEADERS = ["Filename", "Type", "Category", "Client", "Case", "Source", "Size (bytes)", "Added"];

export function buildManifestCsv(rows: ManifestRow[], note?: string): string {
  const lines = [HEADERS.map(csvField).join(",")];
  for (const r of rows) {
    lines.push([
      r.filename ?? "",
      r.docType ?? "",
      r.category ?? "",
      r.client ?? "",
      r.matter ?? "",
      r.source ?? "",
      r.sizeBytes != null ? String(r.sizeBytes) : "",
      r.added ?? "",
    ].map((v) => csvField(String(v))).join(","));
  }
  // A capping note is written as a trailing comment row so a truncated export is never silently
  // presented as complete (product-depth: no silent truncation).
  if (note) lines.push("", csvField(`# ${note}`));
  return lines.join("\r\n") + "\r\n";
}
