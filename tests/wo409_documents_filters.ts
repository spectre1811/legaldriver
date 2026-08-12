// WO-409 · Documents toolbar sort/date-range pure-logic tests (offline, no DB/network).
// Run: npx tsx tests/wo409_documents_filters.ts
import { parseSortBy, sortColumn, dateBounds, DOC_SORT_OPTIONS } from "../src/lib/docs/list-query";

let failures = 0;
const check = (name: string, cond: boolean) => { console.log(`${cond ? "PASS" : "FAIL"}  ${name}`); if (!cond) failures++; };

// --- parseSortBy: fails safe to the default ---
check("parseSortBy(undefined) → date_desc", parseSortBy(undefined) === "date_desc");
check("parseSortBy(null) → date_desc", parseSortBy(null) === "date_desc");
check("parseSortBy('bogus') → date_desc", parseSortBy("bogus") === "date_desc");
check("parseSortBy('date_asc') round-trips", parseSortBy("date_asc") === "date_asc");
check("parseSortBy('name_asc') round-trips", parseSortBy("name_asc") === "name_asc");
check("DOC_SORT_OPTIONS covers every value parseSortBy accepts", DOC_SORT_OPTIONS.every((v) => parseSortBy(v) === v));

// --- sortColumn: maps each choice to a real column + direction ---
check("date_desc → created_at DESC (the default list order)", (() => { const c = sortColumn("date_desc"); return c.column === "created_at" && c.ascending === false; })());
check("date_asc → created_at ASC", (() => { const c = sortColumn("date_asc"); return c.column === "created_at" && c.ascending === true; })());
check("name_asc → filename ASC", (() => { const c = sortColumn("name_asc"); return c.column === "filename" && c.ascending === true; })());

// --- dateBounds: start-of-day / end-of-day, malformed input dropped not thrown ---
const both = dateBounds("2026-08-01", "2026-08-05");
check("fromIso is start-of-day UTC", both.fromIso === "2026-08-01T00:00:00.000Z");
check("toIso is end-of-day UTC (inclusive of the whole 'to' day)", both.toIso === "2026-08-05T23:59:59.999Z");
const none = dateBounds(undefined, undefined);
check("no bounds → both null", none.fromIso === null && none.toIso === null);
const partial = dateBounds("2026-08-01", undefined);
check("only 'from' set → toIso stays null", partial.fromIso !== null && partial.toIso === null);
const bad = dateBounds("not-a-date", "2026-13-40");
check("malformed dates degrade to null, never throw", bad.fromIso === null && bad.toIso === null);
check("empty strings degrade to null", dateBounds("", "").fromIso === null);

console.log(`\n==== ${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`} ====`);
process.exit(failures === 0 ? 0 : 1);
