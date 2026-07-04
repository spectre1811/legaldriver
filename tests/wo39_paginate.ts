// WO-39 · keyset pagination primitive — pure-logic regression (offline, no DB/network).
// Covers the parts that are easy to get subtly wrong: the cursor codec round-trips and
// fails safe on garbage, the keyset filter builds the correct compound comparator with
// safely-quoted values, and finalizePage drops the +1 probe row + mints the next cursor
// only when there IS a next page.
// Run: npx tsx tests/wo39_paginate.ts
import {
  encodeCursor,
  decodeCursor,
  keysetFilter,
  finalizePage,
  paginate,
  type PaginableQuery,
} from "../src/lib/paginate";

let failures = 0;
const check = (name: string, cond: boolean) => { console.log(`${cond ? "PASS" : "FAIL"}  ${name}`); if (!cond) failures++; };

// --- codec round-trip ---
const c1 = encodeCursor("2026-07-05T10:00:00+00:00", "abc-123");
const d1 = decodeCursor(c1);
check("codec round-trips a string value + id", d1?.value === "2026-07-05T10:00:00+00:00" && d1?.id === "abc-123");
check("codec preserves numeric types", (() => { const d = decodeCursor(encodeCursor(42, 7)); return d?.value === 42 && d?.id === 7; })());
check("cursor is URL-safe (base64url, no +/=)", !/[+/=]/.test(c1));

// --- codec fails safe (never throws → degrades to first page) ---
check("decodeCursor(null) → null", decodeCursor(null) === null);
check("decodeCursor(garbage) → null", decodeCursor("!!!not-base64!!!") === null);
check("decodeCursor(valid b64, wrong shape) → null", decodeCursor(Buffer.from('{"x":1}').toString("base64url")) === null);

// --- keyset filter grammar ---
const desc = keysetFilter("created_at", "id", false, { value: "2026-07-05T10:00:00+00:00", id: "abc-123" });
check("descending uses lt + compound tiebreaker",
  desc === 'created_at.lt."2026-07-05T10:00:00+00:00",and(created_at.eq."2026-07-05T10:00:00+00:00",id.lt."abc-123")');
const asc = keysetFilter("list_date", "id", true, { value: 100, id: 5 });
check("ascending uses gt + leaves numbers unquoted",
  asc === "list_date.gt.100,and(list_date.eq.100,id.gt.5)");
check("string values are double-quoted (reserved chars can't break the filter)", desc.includes('.lt."2026-07-05T10:00:00+00:00"'));
check("embedded quotes are escaped", keysetFilter("c", "id", false, { value: 'a"b', id: "x" }).includes('c.lt."a\\"b"'));

// --- finalizePage: drop the probe row, cursor only when more ---
const rows5 = Array.from({ length: 5 }, (_, i) => ({ id: `id${i}`, created_at: `2026-07-0${i + 1}` }));
const full = finalizePage(rows5, 4, "created_at", "id"); // fetched 5 for a page of 4 → more
check("finalizePage trims the +1 probe row to page size", full.rows.length === 4);
check("finalizePage sets nextCursor when a next page exists", full.nextCursor !== null);
check("nextCursor points at the LAST kept row (row index 3), not the probe",
  decodeCursor(full.nextCursor)?.id === "id3");
const short = finalizePage(rows5.slice(0, 3), 4, "created_at", "id"); // fewer than a page → done
check("finalizePage returns all rows when under a page", short.rows.length === 3);
check("finalizePage nextCursor is null on the last page", short.nextCursor === null);
const exact = finalizePage(rows5.slice(0, 4), 4, "created_at", "id"); // exactly a page, no probe
check("exactly-a-page (no probe row) is treated as the last page", exact.nextCursor === null);

// --- executor drives the fluent builder correctly (fake builder, no DB) ---
async function execTest() {
  const calls: string[] = [];
  const makeBuilder = (data: Record<string, unknown>[]): PaginableQuery<Record<string, unknown>> => {
    const b: PaginableQuery<Record<string, unknown>> = {
      or(f: string) { calls.push(`or:${f}`); return b; },
      order(col: string, o: { ascending: boolean }) { calls.push(`order:${col}:${o.ascending}`); return b; },
      limit(n: number) { calls.push(`limit:${n}`); return b; },
      then(resolve) { return Promise.resolve({ data, error: null }).then(resolve); },
    };
    return b;
  };

  // First page (no cursor): no .or(), orders by (col,id), limit = pageSize+1.
  calls.length = 0;
  const page1 = await paginate(makeBuilder(rows5), { column: "created_at", limit: 4 });
  check("first page issues NO keyset .or()", !calls.some((c) => c.startsWith("or:")));
  check("first page orders by (column, id) then limits pageSize+1",
    calls.includes("order:created_at:false") && calls.includes("order:id:false") && calls.includes("limit:5"));
  check("first page yields nextCursor (5 fetched > 4)", page1.nextCursor !== null);

  // Next page (with cursor): emits the keyset .or() built from the cursor.
  calls.length = 0;
  await paginate(makeBuilder(rows5.slice(0, 2)), { column: "created_at", limit: 4, cursor: page1.nextCursor });
  check("next page issues a keyset .or() from the cursor", calls.some((c) => c.startsWith("or:created_at.lt.")));

  // A DB error surfaces (never silently returns empty).
  let threw = false;
  const errBuilder: PaginableQuery<Record<string, unknown>> = {
    or() { return errBuilder; },
    order() { return errBuilder; },
    limit() { return errBuilder; },
    then(resolve) { return Promise.resolve({ data: null, error: { message: "boom" } }).then(resolve); },
  };
  try { await paginate(errBuilder, { column: "created_at" }); } catch { threw = true; }
  check("a Postgrest error throws (no silent empty page)", threw);
}

execTest().then(() => {
  if (failures) { console.error(`\n${failures} check(s) failed`); process.exit(1); }
  console.log("\nAll wo39_paginate checks passed.");
});
