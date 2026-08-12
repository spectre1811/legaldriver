import { buildPdf, type PdfBlock } from "@/lib/docs/pdf";
import { formatCourtDate } from "@/components/court/logic";
import { brand } from "@/lib/brand";
import type { CaseFileData } from "./case-file-data";

// WO-411 · turns the shared case-file data (case-file-data.ts) into the exported PDF's content.
// Pure — no I/O — so it's unit-testable without a DB (tests/wo411_share_export.ts).
//
// Deliberately English-only regardless of the viewer's locale: the hand-rolled PDF writer
// (src/lib/docs/pdf.ts) uses base-14 Helvetica, which has no Devanagari glyphs, so a localized
// label here would silently render as "?" in the download. The court data feeding it (titles,
// party names, hearing purposes) is itself already predominantly Latin-script in this schema.
export function buildCaseFilePdf(data: CaseFileData): Uint8Array<ArrayBuffer> {
  const blocks: PdfBlock[] = [];
  const text = (t: string) => blocks.push({ kind: "text", text: t });
  const field = (label: string, value: string | null) => { if (value) text(`${label}: ${value}`); };

  blocks.push({ kind: "h1", text: data.title });
  field("CNR", data.cnr);
  field("Court", data.court);
  field("Case type", data.caseType);
  field("Stage", data.stage);
  text(`Status: ${data.status}`);
  field("Next hearing", formatCourtDate(data.nextHearingDate));
  blocks.push({
    kind: "muted",
    text: data.lastSyncedAt
      ? `Source: the court record - last refreshed ${new Date(data.lastSyncedAt).toLocaleString("en-IN")}`
      : "Added manually - not yet synced from the court record.",
  });
  blocks.push({ kind: "space" });

  blocks.push({ kind: "h2", text: "Parties & advocates" });
  if (data.parties.length) {
    for (const p of data.parties) text(`${p.side}: ${p.name}${p.advocate ? ` - represented by ${p.advocate}` : ""}`);
  } else {
    blocks.push({ kind: "muted", text: "No parties on record." });
  }
  blocks.push({ kind: "space" });

  blocks.push({ kind: "h2", text: "Hearings & orders" });
  const events = [
    ...data.hearings.map((h) => ({ date: h.date, line: `Hearing${h.purpose ? ` - ${h.purpose}` : ""}${h.judge ? ` (${h.judge})` : ""}` })),
    ...data.orders.map((o) => ({ date: o.date, line: `Order${o.title ? ` - ${o.title}` : ""}` })),
  ].sort((a, b) => b.date.localeCompare(a.date));
  if (events.length) {
    for (const e of events) text(`${formatCourtDate(e.date) ?? e.date} - ${e.line}`);
  } else {
    blocks.push({ kind: "muted", text: "No hearings or orders on record." });
  }
  blocks.push({ kind: "space" });

  blocks.push({ kind: "h2", text: "Deadlines" });
  if (data.deadlines.length) {
    for (const d of data.deadlines) {
      const status = d.status !== "open" ? ` (${d.status})` : "";
      const rule = d.jurisdictionRule ? ` - ${d.jurisdictionRule}` : "";
      text(`${formatCourtDate(d.dueDate) ?? d.dueDate} - ${d.kind.replace(/_/g, " ")}${status}${rule}`);
    }
  } else {
    blocks.push({ kind: "muted", text: "No deadlines on record." });
  }

  blocks.push({ kind: "rule" });
  blocks.push({ kind: "muted", text: `Generated ${new Date().toLocaleString("en-IN")} - ${brand.name}` });
  blocks.push({ kind: "muted", text: "Not legal advice - verify against the official court record." });

  return buildPdf(blocks);
}
