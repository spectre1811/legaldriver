// WO-27 Wave 3 — export + preview pure-logic tests. Run: npx tsx tests/wo27_export.ts
// Covers the hand-rolled zip writer (signatures, CRC, entry count, name de-collision), the
// manifest CSV escaping + capping note, and the inline-preview kind decision. The zip is ALSO
// validated against the system `unzip -t` during development; this test guards the invariants.
//
// WO-365 W1 — DPDP export cap tests drive the REAL handleExport() from the route module
// with a mock supabase client, so the cap arithmetic, error handling, and truncation signal
// are asserted against the same code that serves production requests.
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
const eocdAt = zip.length - 22;
ok("ends with EOCD signature", u32(zip, eocdAt) === 0x06054b50);
ok("EOCD total-entries == 4", u16(zip, eocdAt + 10) === 4);
ok("first local entry declares store method (0)", u16(zip, 8) === 0);
ok("first local entry sets the UTF-8 name flag (bit 11)", (u16(zip, 6) & 0x0800) !== 0);

const cdSize = u32(zip, eocdAt + 12);
const cdOffset = u32(zip, eocdAt + 16);
ok("central directory offset within buffer", cdOffset < zip.length && cdOffset > 0);
ok("central directory sits just before EOCD", cdOffset + cdSize === eocdAt);
ok("first central directory record signature", u32(zip, cdOffset) === 0x02014b50);

const zipText = new TextDecoder("utf-8", { fatal: false }).decode(zip);
ok("duplicate name de-collided to 'dup (1).txt'", zipText.includes("dup (1).txt"));

const collide = buildZip([
  { name: "dup.txt", data: enc.encode("a") },
  { name: "dup.txt", data: enc.encode("b") },
  { name: "dup (1).txt", data: enc.encode("c") },
]);
const collideText = new TextDecoder("utf-8", { fatal: false }).decode(collide);
ok("generated name doesn't clobber a later literal (dup (1) (1).txt present)", collideText.includes("dup (1) (1).txt"));
ok("collision archive has 3 entries", u16(collide, collide.length - 22 + 10) === 3);

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

const inj = buildManifestCsv([
  { filename: "=1+2", docType: null, category: null, client: "@evil", matter: null, source: "gmail", sizeBytes: null, added: null },
]);
ok("formula filename neutralized ('=1+2)", inj.includes("'=1+2"));
ok("formula client field neutralized ('@evil)", inj.includes("'@evil"));
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

// ── WO-365 W1 · DPDP export cap tests driven against the REAL handleExport ───────
async function runExportTests() {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://stub.supabase.test";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "stub-anon-key";

  // Import the REAL handler — this is the same function every production request calls.
  const { handleExport } = await import("../src/lib/export/handler");
  ok("handleExport is a function", typeof handleExport === "function");

  // Route module integrity: GET() loads and is callable (it wraps handleExport).
  const routeMod = await import("../src/app/api/export/route");
  ok("route GET is a function", typeof routeMod.GET === "function");

  // ── mock supabase factory ────────────────────────────────────────────────────
  // Each table gets a { data, count, error } triple configured before the call.
  // The mock records the cap passed to .limit() so the test can assert it.
  // .select() returns a thenable that ALSO carries .limit() — matching supabase-js's
  // PostgrestFilterBuilder (thenable + chainable). This means deleting .limit(cap) from
  // the handler still produces an awaitable type, which lets us prove that test assertions
  // actually catch the missing cap.
  type TableCfg = { data: unknown[]; count: number | null; error?: string };
  function mockSupabase(
    user: { id: string; email: string } | null,
    tables: Record<string, TableCfg>,
  ) {
    const lastCap: Record<string, number> = {};
    const lastTable: string[] = [];
    const didLimit: Record<string, boolean> = {};
    return {
      auth: {
        getUser: async () => ({ data: { user } }),
      },
      from: (tbl: string) => {
        lastTable.push(tbl);
        function doQuery(n: number | undefined) {
          if (n !== undefined) {
            lastCap[tbl] = n;
            didLimit[tbl] = true;
          } else {
            didLimit[tbl] = false;
          }
          const cfg = tables[tbl] ?? { data: [], count: 0 };
          if (cfg.error) return { data: null, count: null, error: { message: cfg.error } };
          const capped = n !== undefined ? cfg.data.slice(0, n) : cfg.data;
          return { data: capped, count: cfg.count, error: null };
        }
        return {
          select: (_cols: string, _opts?: { count?: string }) => {
            // Return a thenable that also carries .limit(). Without .limit(),
            // awaiting the select result runs the query uncapped. This mirrors
            // supabase-js's PostgrestFilterBuilder.
            const uncapped = doQuery(undefined);
            const p = Promise.resolve(uncapped);
            return {
              then: p.then.bind(p),
              catch: p.catch.bind(p),
              finally: p.finally.bind(p),
              limit: (n: number) => Promise.resolve(doQuery(n)),
            };
          },
        };
      },
      _lastCap: lastCap,
      _lastTable: lastTable,
      _didLimit: didLimit,
    };
  }

  // ── helper: parse NextResponse JSON ─────────────────────────────────────────
  async function bodyOf(res: Response) {
    return await res.json() as Record<string, unknown>;
  }

  // ── TEST 1: under cap, no truncation ─────────────────────────────────────────
  {
    const sb = mockSupabase({ id: "u1", email: "a@b" }, {
      "a": { data: [{ x: 1 }], count: 1 },
      "b": { data: [{ y: 2 }, { y: 3 }], count: 2 },
    });
    const res = await handleExport(sb, 100, ["a", "b"]);
    ok("under cap: 200", res.status === 200);
    const body = await bodyOf(res);
    ok("under cap: truncated is false", body.truncated === false);
    ok("under cap: no truncations key", !("truncations" in body));
    ok("under cap: no errors key", !("errors" in body));
    ok("under cap: data a present", Array.isArray(body.a) && (body.a as unknown[]).length === 1);
    ok("under cap: data b present", Array.isArray(body.b) && (body.b as unknown[]).length === 2);
    ok("under cap: cap passed to limit", sb._lastCap["a"] === 100 && sb._lastCap["b"] === 100);
  }

  // ── TEST 2: over cap → truncated: true + per-table details ───────────────────
  {
    const sb = mockSupabase({ id: "u1", email: "a@b" }, {
      "big": { data: Array(20).fill({}), count: 47 },
    });
    const res = await handleExport(sb, 10, ["big"]);
    ok("over cap: 200", res.status === 200);
    const body = await bodyOf(res);
    ok("over cap: truncated is true", body.truncated === true);
    ok("over cap: truncations present", typeof body.truncations === "object" && body.truncations !== null);
    const t = (body.truncations as Record<string, unknown>)["big"] as { returned: number; omitted: number; total: number };
    ok("over cap: returned = cap", t.returned === 10);
    ok("over cap: omitted = total - returned", t.omitted === 37);
    ok("over cap: total matches count", t.total === 47);
    ok("over cap: only 10 rows in data (capped)", (body.big as unknown[]).length === 10);
    ok("over cap: cap passed to limit", sb._lastCap["big"] === 10);
  }

  // ── TEST 3: exactly at cap → NOT truncated ───────────────────────────────────
  {
    const sb = mockSupabase({ id: "u1", email: "a@b" }, {
      "t": { data: Array(10).fill({}), count: 10 },
    });
    const res = await handleExport(sb, 10, ["t"]);
    const body = await bodyOf(res);
    ok("at cap: truncated is false", body.truncated === false);
    ok("at cap: data has 10 rows", (body.t as unknown[]).length === 10);
  }

  // ── TEST 4: mixed tables (one over, one under) ───────────────────────────────
  {
    const sb = mockSupabase({ id: "u1", email: "a@b" }, {
      "ok": { data: Array(2).fill({}), count: 2 },
      "over": { data: Array(5).fill({}), count: 20 },
    });
    const res = await handleExport(sb, 5, ["ok", "over"]);
    const body = await bodyOf(res);
    ok("mixed: truncated is true", body.truncated === true);
    const tr = body.truncations as Record<string, unknown>;
    ok("mixed: only 'over' in truncations", "over" in tr && !("ok" in tr));
    ok("mixed: over returned = cap", (tr["over"] as { returned: number }).returned === 5);
    ok("mixed: over omitted = 15", (tr["over"] as { omitted: number }).omitted === 15);
  }

  // ── TEST 5: empty table — no truncation ──────────────────────────────────────
  {
    const sb = mockSupabase({ id: "u1", email: "a@b" }, {
      "empty": { data: [], count: 0 },
    });
    const res = await handleExport(sb, 10, ["empty"]);
    const body = await bodyOf(res);
    ok("empty: truncated is false", body.truncated === false);
    ok("empty: data is []", (body.empty as unknown[]).length === 0);
  }

  // ── TEST 6: B3 — count is null AND rows hit cap → truncation signalled ──────
  {
    const sb = mockSupabase({ id: "u1", email: "a@b" }, {
      "x": { data: Array(5).fill({}), count: null },
    });
    const res = await handleExport(sb, 5, ["x"]);
    const body = await bodyOf(res);
    ok("count-null at cap: truncated is true", body.truncated === true);
    ok("count-null at cap: x in truncations", typeof body.truncations === "object" && "x" in (body.truncations as object));
    const t = (body.truncations as Record<string, unknown>)["x"] as { returned: number; omitted: number; total: number };
    ok("count-null at cap: returned = cap", t.returned === 5);
    ok("count-null at cap: omitted is 0 (count unavailable)", t.omitted === 0);
    ok("count-null at cap: total = rows.length", t.total === 5);
  }

  // ── TEST 7: B3 — count is null, rows UNDER cap → no truncation ───────────────
  {
    const sb = mockSupabase({ id: "u1", email: "a@b" }, {
      "x": { data: [{ a: 1 }], count: null },
    });
    const res = await handleExport(sb, 10, ["x"]);
    const body = await bodyOf(res);
    ok("count-null under cap: truncated is false", body.truncated === false);
  }

  // ── TEST 8: B2 — query error → table excluded, surfaced in errors map ────────
  {
    const sb = mockSupabase({ id: "u1", email: "a@b" }, {
      "good": { data: [{ x: 1 }], count: 1 },
      "bad": { data: [], count: 0, error: "relation \"bad\" does not exist" },
    });
    const res = await handleExport(sb, 10, ["good", "bad"]);
    ok("error table: 200 (partial, not failed)", res.status === 200);
    const body = await bodyOf(res);
    ok("error table: truncated is false", body.truncated === false);
    ok("error table: errors key present", typeof body.errors === "object" && body.errors !== null);
    const errs = body.errors as Record<string, string>;
    ok("error table: bad in errors", "bad" in errs);
    ok("error table: good in payload", "good" in body);
    ok("error table: bad NOT in payload (never masquerades as empty)", !("bad" in body));
  }

  // ── TEST 9: unauthenticated → 401 ────────────────────────────────────────────
  {
    const sb = mockSupabase(null, {});
    const res = await handleExport(sb, 10, []);
    ok("no user: 401", res.status === 401);
    const body = await bodyOf(res);
    ok("no user: error message", body.error === "unauthenticated");
  }
}

runExportTests().then(() => {
  console.log(failed === 0 ? "\nPASS" : `\nFAIL (${failed})`);
  process.exit(failed === 0 ? 0 : 1);
}).catch((e) => {
  console.error("THROWN", e);
  process.exit(1);
});
