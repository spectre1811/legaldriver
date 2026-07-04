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

// ── previewKind ──────────────────────────────────────────────────────────────────
ok("pdf by mime", previewKind("application/pdf", "x") === "pdf");
ok("pdf by extension when mime generic", previewKind("application/octet-stream", "brief.PDF") === "pdf");
ok("image by mime", previewKind("image/png", "x") === "image");
ok("image by extension", previewKind(null, "scan.jpeg") === "image");
ok("docx → none", previewKind("application/vnd.openxmlformats-officedocument.wordprocessingml.document", "a.docx") === "none");
ok("unknown/null → none", previewKind(null, null) === "none");

console.log(failed === 0 ? "\nPASS" : `\nFAIL (${failed})`);
process.exit(failed === 0 ? 0 : 1);
