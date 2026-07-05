// WO-43-W2 · Cases senior-grade — pure-logic regression (offline, no DB/network).
// Covers the two easy-to-break, security-relevant helpers behind the selection-first Cases list:
//   • parseSort — the sort-column ALLOWLIST (a garbage/hostile `sort` param must never reach ORDER
//     BY) plus legacy saved-view back-compat and asc/desc resolution.
//   • toCasesCsv — RFC-4180 quoting for the bulk CSV export (commas, quotes, newlines, nulls).
// Run: npx tsx tests/wo43_bulk_cases.ts
import { parseSort, toCasesCsv, type MatterRow } from "../src/app/dashboard/cases/cases-query";

let failed = 0;
function ok(name: string, cond: boolean) {
  console.log(`${cond ? "✓" : "✗ FAIL"} ${name}`);
  if (!cond) failed++;
}

// ── parseSort: allowlist + direction ────────────────────────────────────────────────────────────
ok("empty → default order (null)", parseSort(undefined) === null && parseSort("") === null);
ok("title.asc", JSON.stringify(parseSort("title.asc")) === JSON.stringify({ column: "title", ascending: true }));
ok("next.desc → next_hearing_date desc", JSON.stringify(parseSort("next.desc")) === JSON.stringify({ column: "next_hearing_date", ascending: false }));
ok("court.asc maps to court", parseSort("court.asc")?.column === "court");
ok("stage.desc", JSON.stringify(parseSort("stage.desc")) === JSON.stringify({ column: "stage", ascending: false }));
ok("status default dir is asc", parseSort("status")?.ascending === true);
// Legacy bare values from older saved views still resolve.
ok("legacy created_at → created_at desc", JSON.stringify(parseSort("created_at")) === JSON.stringify({ column: "created_at", ascending: false }));
ok("legacy title → title asc", JSON.stringify(parseSort("title")) === JSON.stringify({ column: "title", ascending: true }));
// SECURITY: anything not in the allowlist resolves to null (→ safe default), never a raw column.
ok("unknown key → null", parseSort("password.asc") === null);
ok("SQL-ish injection → null", parseSort("id; drop table matter;--") === null);
ok("column-name not in allowlist (tenant_id) → null", parseSort("tenant_id.asc") === null);
ok("bad direction defaults to asc (not injected)", parseSort("title.sideways")?.ascending === true);

// ── toCasesCsv: RFC-4180 quoting ─────────────────────────────────────────────────────────────────
const row = (o: Partial<MatterRow>): MatterRow => ({
  id: "x", cnr: null, title: "", court: null, case_type: null, stage: null, status: null,
  next_hearing_date: null, next_hearing_override: null, last_synced_at: null, source: null,
  party_names: null, client: null, ...o,
});

const csv = toCasesCsv([
  row({ title: "Sharma v State", cnr: "GJHC01-000123-2025", court: "High Court of Gujarat", stage: "arguments", status: "open", next_hearing_date: "2026-07-20" }),
  row({ title: 'Acme, Inc. "matter"', cnr: null, court: null, next_hearing_date: null }),
  row({ title: "Line\nbreak", next_hearing_override: "2026-08-01", next_hearing_date: "2026-07-01" }),
]);
const lines = csv.split("\r\n");
ok("header row present", lines[0] === '"Title","CNR","Court","Case type","Stage","Status","Next hearing"');
ok("CRLF terminated rows", csv.includes("\r\n") && lines.length === 4);
ok("plain row quoted + values placed", lines[1] === '"Sharma v State","GJHC01-000123-2025","High Court of Gujarat","","arguments","open","2026-07-20"');
ok("embedded quotes doubled", lines[2].startsWith('"Acme, Inc. ""matter"""'));
ok("null cells → empty quoted", lines[2].includes('","","'));
ok("override date wins over synced date", lines[3].endsWith('"2026-08-01"'));
ok("embedded newline stays inside its quoted field", lines[3].startsWith('"Line\nbreak"'));

console.log(failed === 0 ? "\nPASS" : `\nFAIL (${failed})`);
process.exit(failed === 0 ? 0 : 1);
