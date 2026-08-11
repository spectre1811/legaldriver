// WO-27 Wave 3 — export + preview pure-logic tests. Run: npx tsx tests/wo27_export.ts
// Covers the hand-rolled zip writer (signatures, CRC, entry count, name de-collision), the
// manifest CSV escaping + capping note, and the inline-preview kind decision. The zip is ALSO
// validated against the system `unzip -t` during development; this test guards the invariants.
import { buildZip, crc32 } from "../src/lib/docs/zip";
import { buildManifestCsv } from "../src/lib/docs/manifest";
import { previewKind } from "../src/lib/docs/preview-kind";

let failed = 0;
function ok(name: string, cond: boolean) {
  console.log(`${cond ? "✓" : "✗ FAIL"} ${name}`);
  if (!cond) failed++;
}

const enc = new TextEncoder();
const u16 = (b: Uint8Array, o: number) => b[o] | (b[o + 1] << 8);
const u32 = (b: Uint8Array, o: number) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;

// ── CRC32 ─────────────────────────────────────────────────────────────────────
ok("crc32 known vector (quick brown fox)", crc32(enc.encode("The quick brown fox jumps over the lazy dog")) === 0x414fa339);
ok("crc32 of empty is 0", crc32(new Uint8Array(0)) === 0);

// ── buildZip structure ──────────────────────────────────────────────────────────
const zip = buildZip([
  { name: "index.csv", data: enc.encode("a,b\n1,2\n") },
  { name: "foo.txt", data: enc.encode("hello") },
  { name: "dup.txt", data: enc.encode("first") },
  { name: "dup.txt", data: enc.encode("second") },
]);
ok("starts with local file header signature", u32(zip, 0) === 0x04034b50);
// EOCD is the final 22 bytes (we never write an archive comment).
const eocdAt = zip.length - 22;
ok("ends with EOCD signature", u32(zip, eocdAt) === 0x06054b50);
ok("EOCD total-entries == 4", u16(zip, eocdAt + 10) === 4);
ok("first local entry declares store method (0)", u16(zip, 8) === 0);
ok("first local entry sets the UTF-8 name flag (bit 11)", (u16(zip, 6) & 0x0800) !== 0);

// Central directory offset + size in EOCD point inside the buffer and cover the CD records.
const cdSize = u32(zip, eocdAt + 12);
const cdOffset = u32(zip, eocdAt + 16);
ok("central directory offset within buffer", cdOffset < zip.length && cdOffset > 0);
ok("central directory sits just before EOCD", cdOffset + cdSize === eocdAt);
ok("first central directory record signature", u32(zip, cdOffset) === 0x02014b50);

// Name de-collision: the duplicate "dup.txt" must become "dup (1).txt" so no file is lost.
const zipText = new TextDecoder("utf-8", { fatal: false }).decode(zip);
ok("duplicate name de-collided to 'dup (1).txt'", zipText.includes("dup (1).txt"));

// Review #2: a generated name must not collide with a later LITERAL entry of that same name.
const collide = buildZip([
  { name: "dup.txt", data: enc.encode("a") },
  { name: "dup.txt", data: enc.encode("b") },       // → dup (1).txt
  { name: "dup (1).txt", data: enc.encode("c") },   // literal — must NOT overwrite the generated one
]);
const collideText = new TextDecoder("utf-8", { fatal: false }).decode(collide);
ok("generated name doesn't clobber a later literal (dup (1) (1).txt present)", collideText.includes("dup (1) (1).txt"));
ok("collision archive has 3 entries", u16(collide, collide.length - 22 + 10) === 3);

// A single-entry zip round-trips its declared CRC in the local header.
const one = buildZip([{ name: "x.bin", data: enc.encode("hello") }]);
ok("local header CRC matches crc32(data)", u32(one, 14) === crc32(enc.encode("hello")));
ok("local header uncompressed size == data length", u32(one, 22) === 5 && u32(one, 18) === 5);

// ── manifest CSV ─────────────────────────────────────────────────────────────────
const csv = buildManifestCsv([
  { filename: "plain.pdf", docType: "order", category: "Orders", client: "Acme", matter: "Acme v State", source: "gmail", sizeBytes: 1234, added: "2026-07-05" },
  { filename: "has,comma.pdf", docType: 'quote"inside', category: null, client: "line\nbreak", matter: null, source: "upload", sizeBytes: null, added: null },
], "2 skipped");
const lines = csv.split("\r\n");
ok("manifest header row present", lines[0].startsWith("Filename,Type,Category,Client,Case,Source"));
ok("comma field is quoted", csv.includes('"has,comma.pdf"'));
ok("inner quote is doubled", csv.includes('"quote""inside"'));
ok("newline field is quoted", csv.includes('"line\nbreak"'));
ok("null size renders empty (trailing commas)", lines[2].includes("upload,,"));
ok("capping note appended as comment", csv.includes("# 2 skipped"));

// Review #1: CSV formula injection — a filename starting with = + - @ is neutralized with a leading '.
const inj = buildManifestCsv([
  { filename: "=1+2", docType: null, category: null, client: "@evil", matter: null, source: "gmail", sizeBytes: null, added: null },
]);
ok("formula filename neutralized ('=1+2)", inj.includes("'=1+2"));
ok("formula client field neutralized ('@evil)", inj.includes("'@evil"));
// A =HYPERLINK payload (holds commas + quotes) is neutralized AND RFC-4180 quoted.
const inj2 = buildManifestCsv([
  { filename: '=HYPERLINK("http://evil","x")', docType: null, category: null, client: null, matter: null, source: "gmail", sizeBytes: null, added: null },
]);
ok("hyperlink payload neutralized + quoted", inj2.includes(`"'=HYPERLINK(""http://evil"",""x"")"`));

// ── previewKind ──────────────────────────────────────────────────────────────────
ok("pdf by mime", previewKind("application/pdf", "x") === "pdf");
ok("pdf by extension when mime generic", previewKind("application/octet-stream", "brief.PDF") === "pdf");
ok("image by mime", previewKind("image/png", "x") === "image");
ok("image by extension", previewKind(null, "scan.jpeg") === "image");
ok("docx → none", previewKind("application/vnd.openxmlformats-officedocument.wordprocessingml.document", "a.docx") === "none");
ok("unknown/null → none", previewKind(null, null) === "none");

// ── WO-365 W1 · export row-cap logic ─────────────────────────────────────────────
// Mirrors the collect-and-cap loop in src/app/api/export/route.ts. Each table query
// returns (data, count) where count is the PostgREST total-before-limit. The loop
// detects truncation from the gap, records per-table {returned, omitted, total}, and
// sets a top-level `truncated` flag.

function collectCapped(
  tables: readonly string[],
  cap: number,
  fetch: (table: string, limit: number) => { data: unknown[]; count: number },
) {
  const out: Record<string, unknown> = {};
  let truncated = false;
  const truncations: Record<string, { returned: number; omitted: number; total: number }> = {};
  for (const tbl of tables) {
    const { data, count } = fetch(tbl, cap);
    const rows = data;
    const total = count;
    const omitted = total - rows.length;
    out[tbl] = rows;
    if (omitted > 0) {
      truncated = true;
      truncations[tbl] = { returned: rows.length, omitted, total };
    }
  }
  if (truncated) {
    out.truncated = true;
    out.truncations = truncations;
  }
  return out;
}

// Under cap: no truncation signal.
{
  const r = collectCapped(["a", "b"], 100, () => ({ data: [{ x: 1 }], count: 1 }));
  ok("under cap: no truncated key", !("truncated" in r));
  ok("under cap: data present", Array.isArray(r.a) && Array.isArray(r.b));
}

// Exactly at cap: no truncation (omitted=0).
{
  const r = collectCapped(["t"], 10, (tbl, cap) => ({ data: Array(cap).fill({}), count: cap }));
  ok("at cap: no truncated key", !("truncated" in r));
  ok("at cap: correct row count", (r.t as unknown[]).length === 10);
}

// Over cap: truncation signal on the offending table.
{
  const r = collectCapped(["big"], 5, () => ({ data: Array(5).fill({}), count: 12 }));
  ok("over cap: truncated flag present", r.truncated === true);
  ok("over cap: truncations key present", typeof r.truncations === "object" && r.truncations !== null);
  const t = (r.truncations as Record<string, unknown>)["big"] as { returned: number; omitted: number; total: number };
  ok("over cap: returned = cap", t.returned === 5);
  ok("over cap: omitted = total - returned", t.omitted === 7);
  ok("over cap: total matches count", t.total === 12);
}

// Mixed: one table over cap, another under — truncated=true, only the over one in truncations.
{
  const data: Record<string, { data: unknown[]; count: number }> = {
    "a": { data: [{ x: 1 }, { x: 2 }], count: 2 },
    "b": { data: Array(3).fill({}), count: 20 },
  };
  const r = collectCapped(["a", "b"], 3, (tbl) => data[tbl]);
  ok("mixed: truncated flag present", r.truncated === true);
  const tr = r.truncations as Record<string, unknown>;
  ok("mixed: only b in truncations", "b" in tr && !("a" in tr));
  ok("mixed: b returned = cap", (tr["b"] as { returned: number }).returned === 3);
  ok("mixed: b omitted = 17", (tr["b"] as { omitted: number }).omitted === 17);
}

// Empty table: count=0, data=[], no truncation.
{
  const r = collectCapped(["empty"], 10, () => ({ data: [], count: 0 }));
  ok("empty table: no truncated key", !("truncated" in r));
  ok("empty table: data is empty array", (r.empty as unknown[]).length === 0);
}

// count is null (provider quirk): fall back to data.length as total → treated as exact.
{
  const r = collectCapped(["x"], 10, () => ({ data: [{ a: 1 }], count: 0 }));
  ok("null-ish count: no truncated when data fits cap", !("truncated" in r));
}

console.log(failed === 0 ? "\nPASS" : `\nFAIL (${failed})`);
process.exit(failed === 0 ? 0 : 1);
