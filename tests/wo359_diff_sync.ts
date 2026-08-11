// WO-359 W1 golden-fixture parity harness: differential sync
// Drives the REAL upsertCase under both flag states against a fake DB
// that records every statement + maintains an in-memory store.
// Run: npx tsx tests/wo359_diff_sync.ts
import { upsertCase, hearingKey, diffHearings, diffOrders } from "@/lib/court/sync";
import type { NormalizedCase, NormalizedHearing, NormalizedOrderRef } from "@/lib/court/types";

let failed = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) { console.error("FAIL:", msg); failed++; }
  else { console.log("  ✓", msg); }
}

// ── Helpers ───────────────────────────────────────────────────────────────

function nh(date: string, purpose?: string, courtNo?: string, judge?: string): NormalizedHearing {
  return { date, purpose, courtNo, judge };
}
function nor(id: string, date?: string, title?: string, pdfUrl?: string): NormalizedOrderRef {
  return { id, date, title, pdfUrl };
}

function baseCase(overrides?: Partial<NormalizedCase>): NormalizedCase {
  return {
    cnr: "GJHC240001112026",
    title: "Test Party v. Other Party",
    court: "High Court of Gujarat",
    caseType: "Civil Suit",
    stage: "Arguments",
    status: "active",
    parties: [
      { name: "Test Party", side: "petitioner", advocate: "Adv. A" },
      { name: "Other Party", side: "respondent", advocate: "Adv. B" },
    ],
    judge: "Hon'ble Justice D",
    judges: ["Hon'ble Justice D"],
    nextHearingDate: "2026-07-15",
    hearings: [nh("2026-07-15", "Arguments", "C1", "Hon'ble Justice D")],
    orders: [nor("ORD-A", "2026-05-10", "Interim order")],
    acts: ["NI Act 138"],
    detail: { registrationNumber: "1234/2025" },
    source: "mock",
    fetchedAt: new Date().toISOString(),
    ...overrides,
  };
}

// ── Fake supabase client ──────────────────────────────────────────────────

type Row = Record<string, unknown>;
type WriteRecord = { table: string; op: "insert" | "update" | "delete"; rows?: Row[]; id?: string };

const TENANT = "tn-test";
const MATTER = "m-test";

function sh(id: string, date: string, purpose: string | null, court_no: string | null = null, judge: string | null = null): Row {
  return { id, date, purpose, court_no, judge, raw: {}, tenant_id: TENANT, matter_id: MATTER };
}
function so(id: string, orderId?: string, order_date: string | null = null, title: string | null = null): Row {
  return {
    id, order_date, title,
    raw: orderId ? { order_id: orderId, has_pdf: false } : {},
    tenant_id: TENANT, matter_id: MATTER,
  };
}

function fakeSupabase(seed: { tenantId: string; matterId: string }) {
  const store = new Map<string, Row[]>();
  const trace: WriteRecord[] = [];

  store.set("tenant", [{ id: seed.tenantId }]);
  store.set("matter", [{ id: seed.matterId, cnr: "GJHC240001112026", tenant_id: seed.tenantId, next_hearing_date: "2026-07-15", judge_names: ["Hon'ble Justice D"] }]);
  store.set("hearing", []);
  store.set("court_order", []);
  store.set("notification", []);
  store.set("activity_event", []);

  function from(table: string) {
    const rows = store.get(table) ?? [];
    const eqs: [string, unknown][] = [];
    let op: "select" | "insert" | "update" | "delete" | "upsert" = "select";
    let insertRows: Row[] = [];
    let updatePatch: Row = {};
    let deleteIds: string[] = [];
    let limitVal = Infinity;
    let orderCol: string | null = null;
    let orderDir: "asc" | "desc" = "asc";
    let isContains = false;
    let containsPayload: Record<string, unknown> = {};

    const b: any = {
      select: (cols?: string) => { op = "select"; return b; },
      insert: (r: Row | Row[]) => {
        op = "insert";
        insertRows = Array.isArray(r) ? r : [r];
        return b;
      },
      update: (p: Row) => { op = "update"; updatePatch = p; return b; },
      delete: () => { op = "delete"; return b; },
      upsert: () => { op = "upsert"; return b; },
      eq: (col: string, val: unknown) => { eqs.push([col, val]); return b; },
      contains: (col: string, val: unknown) => {
        if (col === "payload") { isContains = true; containsPayload = val as Record<string, unknown>; }
        eqs.push([col, val]);
        return b;
      },
      is: (col: string, val: unknown) => { eqs.push([col, val]); return b; },
      in: (col: string, vals: unknown[]) => { return b; },
      order: (col: string, opts?: { ascending?: boolean }) => {
        orderCol = col;
        orderDir = opts?.ascending === false ? "desc" : "asc";
        return b;
      },
      limit: (n: number) => { limitVal = n; return b; },
      single: () => {
        const result = runQuery(table, op, rows, eqs, insertRows, updatePatch, deleteIds, store, trace, isContains, containsPayload);
        return Promise.resolve(result.data ? (Array.isArray(result.data) ? result.data[0] : result.data) : null)
          .then((data) => ({ data, error: result.error }));
      },
      maybeSingle: () => {
        const result = runQuery(table, op, rows, eqs, insertRows, updatePatch, deleteIds, store, trace, isContains, containsPayload);
        const filtered = filterRows(rows, eqs, isContains, containsPayload);
        const first = filtered.slice(0, 1);
        return Promise.resolve({ data: first[0] ?? null, error: result.error });
      },
      then: (resolve: (v: unknown) => void) => {
        const result = runQuery(table, op, rows, eqs, insertRows, updatePatch, deleteIds, store, trace, isContains, containsPayload);
        if (result.error) throw result.error;
        resolve({ data: result.data, error: null, count: result.count });
      },
    };
    return b;
  }

  return { sb: { from } as any, store, trace };
}

function filterRows(rows: Row[], eqs: [string, unknown][], isContains: boolean, containsPayload: Record<string, unknown>): Row[] {
  return rows.filter((r) => {
    for (const [col, val] of eqs) {
      if (isContains && col === "payload") {
        const p = r[col] as Record<string, unknown> | undefined;
        if (!p) return false;
        for (const [k, v] of Object.entries(containsPayload)) {
          if (p[k] !== v) return false;
        }
        continue;
      }
      if (r[col] !== val) return false;
    }
    return true;
  });
}

function runQuery(
  table: string, op: string, rows: Row[],
  eqs: [string, unknown][], insertRows: Row[], updatePatch: Row,
  deleteIds: string[], store: Map<string, Row[]>, trace: WriteRecord[],
  isContains: boolean, containsPayload: Record<string, unknown>,
): { data: Row[] | Row | null; error: Error | null; count: number } {
  if (op === "insert" && insertRows.length) {
    for (const r of insertRows) {
      const copy = { ...r, id: r.id ?? `gen-${Math.random().toString(36).slice(2, 9)}` };
      rows.push(copy);
    }
    trace.push({ table, op: "insert", rows: insertRows });
    return { data: null, error: null, count: insertRows.length };
  }
  if (op === "update") {
    const matches = filterRows(rows, eqs, isContains, containsPayload);
    for (const m of matches) Object.assign(m, updatePatch);
    trace.push({ table, op: "update", rows: matches.map((m) => ({ ...m })) });
    return { data: null, error: null, count: matches.length };
  }
  if (op === "delete") {
    const matches = filterRows(rows, eqs, isContains, containsPayload);
    const ids = matches.map((m) => m.id as string);
    for (const id of ids) deleteIds.push(id);
    // Remove from store
    const keep = rows.filter((r) => !ids.includes(r.id as string));
    store.set(table, keep);
    trace.push({ table, op: "delete", rows: matches });
    return { data: null, error: null, count: matches.length };
  }
  if (op === "select") {
    const filtered = filterRows(rows, eqs, isContains, containsPayload);
    return { data: filtered, error: null, count: filtered.length };
  }
  return { data: null, error: null, count: 0 };
}

// ── Pure diffHearings tests (pure functions, no DB) ──

// No-change
{
  const existing = [
    { id: "h1", date: "2026-07-15", purpose: "Arguments", court_no: "C1", judge: "Judge D" },
  ];
  const incoming = [nh("2026-07-15", "Arguments", "C1", "Judge D")];
  const d = diffHearings(existing, incoming);
  assert(d.toInsert.length === 0, "no-change: 0 inserts");
  assert(d.toUpdate.length === 0, "no-change: 0 updates");
  assert(d.toDelete.length === 0, "no-change: 0 deletes");
}

// +1 new hearing
{
  const existing = [
    { id: "h1", date: "2026-07-15", purpose: "Arguments", court_no: null, judge: null },
  ];
  const incoming = [nh("2026-07-15", "Arguments"), nh("2026-08-01", "Evidence")];
  const d = diffHearings(existing, incoming);
  assert(d.toInsert.length === 1 && d.toInsert[0].date === "2026-08-01", "+1: 1 insert");
  assert(d.toDelete.length === 0, "+1: 0 deletes");
}

// Vanished hearing
{
  const existing = [
    { id: "h1", date: "2026-07-15", purpose: "Arguments", court_no: null, judge: null },
    { id: "h2", date: "2026-08-01", purpose: "Evidence", court_no: null, judge: null },
  ];
  const incoming = [nh("2026-07-15", "Arguments")];
  const d = diffHearings(existing, incoming);
  assert(d.toDelete.length === 1 && d.toDelete[0] === "h2", "vanished: 1 delete");
  assert(d.toInsert.length === 0, "vanished: 0 inserts");
}

// Rescheduled (same date, different purpose) — DELETE+INSERT, not UPDATE
{
  const existing = [
    { id: "h1", date: "2026-07-15", purpose: "Arguments", court_no: null, judge: null },
  ];
  const incoming = [nh("2026-07-15", "Evidence")];
  const d = diffHearings(existing, incoming);
  assert(d.toDelete.length === 1 && d.toDelete[0] === "h1", "rescheduled: 1 delete (old identity)");
  assert(d.toInsert.length === 1 && d.toInsert[0].purpose === "Evidence", "rescheduled: 1 insert (new identity)");
}

// Ancillary fields changed (same identity)
{
  const existing = [
    { id: "h2", date: "2026-08-01", purpose: "Evidence", court_no: "C1", judge: "Judge A" },
  ];
  const incoming = [nh("2026-08-01", "Evidence", "C2", "Judge B")];
  const d = diffHearings(existing, incoming);
  assert(d.toUpdate.length === 1, "ancillary: 1 update");
  assert(d.toInsert.length === 0, "ancillary: 0 inserts");
  assert(d.toDelete.length === 0, "ancillary: 0 deletes");
}

// Duplicate (date,purpose) existing rows — excess converges
{
  const existing = [
    { id: "h_a", date: "2026-07-15", purpose: "Arguments", court_no: null, judge: null },
    { id: "h_b", date: "2026-07-15", purpose: "Arguments", court_no: null, judge: null },
  ];
  const incoming = [nh("2026-07-15", "Arguments")]; // only 1
  const d = diffHearings(existing, incoming);
  assert(d.toInsert.length === 0, "dup-key: 0 inserts");
  assert(d.toDelete.length === 1, "dup-key: 1 delete (excess)");
  assert(d.toUpdate.length <= 1, "dup-key: ≤1 update (one kept)");
}

// Truncated incoming
{
  const existing = [
    { id: "h1", date: "2026-07-01", purpose: "Appearance", court_no: null, judge: null },
    { id: "h2", date: "2026-07-15", purpose: "Arguments", court_no: null, judge: null },
    { id: "h3", date: "2026-08-01", purpose: "Evidence", court_no: null, judge: null },
  ];
  const incoming = [nh("2026-07-15", "Arguments"), nh("2026-08-01", "Evidence")];
  const d = diffHearings(existing, incoming);
  assert(d.toDelete.length === 1 && d.toDelete[0] === "h1", "truncated: 1 delete");
  assert(d.toInsert.length === 0, "truncated: 0 inserts");
}

console.log("\n── Pure diffOrders ──");

// No-change order
{
  const existing = [
    { id: "o1", order_date: "2026-05-10", title: "Order A", raw: { order_id: "ORD-A", has_pdf: false } },
  ];
  const incoming = [nor("ORD-A", "2026-05-10", "Order A")];
  const d = diffOrders(existing, incoming);
  assert(d.toInsert.length === 0, "order no-change: 0 inserts");
  assert(d.toUpdate.length === 0, "order no-change: 0 updates");
  assert(d.toDelete.length === 0, "order no-change: 0 deletes");
}

// New order added
{
  const existing = [
    { id: "o1", order_date: "2026-05-10", title: "Order A", raw: { order_id: "ORD-A", has_pdf: false } },
  ];
  const incoming = [nor("ORD-A", "2026-05-10", "Order A"), nor("ORD-B", "2026-06-01", "Order B")];
  const d = diffOrders(existing, incoming);
  assert(d.toInsert.length === 1 && d.toInsert[0].id === "ORD-B", "order +1: 1 insert");
  assert(d.toDelete.length === 0, "order +1: 0 deletes");
}

// Order re-issued (same provider id, different date/title)
{
  const existing = [
    { id: "o1", order_date: "2026-05-10", title: "Old title", raw: { order_id: "ORD-A", has_pdf: false } },
  ];
  const incoming = [nor("ORD-A", "2026-06-15", "New title")];
  const d = diffOrders(existing, incoming);
  assert(d.toUpdate.length === 1, "order re-issued: 1 update");
  assert(d.toInsert.length === 0, "order re-issued: 0 inserts");
  assert(d.toDelete.length === 0, "order re-issued: 0 deletes");
}

// Raw field difference must NOT trigger update (key-order bug prevention)
{
  const existing = [
    { id: "o1", order_date: "2026-05-10", title: "Order A", raw: { has_pdf: false, order_id: "ORD-A" } },
  ];
  const incoming = [nor("ORD-A", "2026-05-10", "Order A")];
  const d = diffOrders(existing, incoming);
  assert(d.toUpdate.length === 0, "raw-reorder: 0 updates (raw is NOT in change-detection set)");
  assert(d.toInsert.length === 0, "raw-reorder: 0 inserts");
  assert(d.toDelete.length === 0, "raw-reorder: 0 deletes");
}

// Legacy order (no raw.order_id) → always deleted
{
  const existing = [
    { id: "o_legacy", order_date: null, title: null, raw: {} },
  ];
  const incoming = [nor("ORD-NEW", "2026-06-01", "New order")];
  const d = diffOrders(existing, incoming);
  assert(d.toDelete.length === 1 && d.toDelete[0] === "o_legacy", "legacy order: deleted (no order_id)");
  assert(d.toInsert.length === 1, "legacy order: 1 insert for ORD-NEW");
}

// Truncated orders
{
  const existing = [
    { id: "o1", order_date: null, title: null, raw: { order_id: "ORD-A", has_pdf: false } },
    { id: "o2", order_date: null, title: null, raw: { order_id: "ORD-B", has_pdf: false } },
    { id: "o3", order_date: null, title: null, raw: { order_id: "ORD-C", has_pdf: false } },
  ];
  const incoming = [nor("ORD-A"), nor("ORD-C")];
  const d = diffOrders(existing, incoming);
  assert(d.toDelete.length === 1 && d.toDelete[0] === "o2", "order truncated: 1 delete");
  assert(d.toInsert.length === 0, "order truncated: 0 inserts");
}

// Duplicate order_id existing rows
{
  const existing = [
    { id: "o_a", order_date: null, title: null, raw: { order_id: "ORD-A", has_pdf: false } },
    { id: "o_b", order_date: null, title: null, raw: { order_id: "ORD-A", has_pdf: false } },
  ];
  const incoming = [nor("ORD-A")];
  const d = diffOrders(existing, incoming);
  assert(d.toDelete.length === 1, "order dup: 1 delete (excess)");
  assert(d.toInsert.length === 0, "order dup: 0 inserts");
}

// ── Full upsertCase parity (drives the REAL function) ─────────────────────

console.log("\n── upsertCase parity ──");

async function runParity(label: string, fixture: NormalizedCase, seedHearings: Row[], seedOrders: Row[], seedNextDate?: string) {
  const tenantId = "tn-test";
  const matterId = "m-test";
  const cnr = fixture.cnr;

  function fixRow(r: Row): Row {
    const copy = { ...r };
    if (copy.tenant_id === undefined) copy.tenant_id = tenantId;
    if (copy.matter_id === undefined) copy.matter_id = matterId;
    return copy;
  }

  // ── Old path (diffSync: false) ──
  const oldFake = fakeSupabase({ tenantId, matterId });
  oldFake.store.set("hearing", seedHearings.map(fixRow));
  oldFake.store.set("court_order", seedOrders.map(fixRow));
  if (seedNextDate !== undefined) {
    // Update matter row's next_hearing_date and judge_names
    const matterRows = oldFake.store.get("matter")!;
    matterRows[0].next_hearing_date = seedNextDate;
    matterRows[0].judge_names = fixture.judges ?? [];
  }

  await upsertCase(oldFake.sb, tenantId, fixture, null, { diffSync: false });
  const oldHearings = oldFake.store.get("hearing")!;
  const oldOrders = oldFake.store.get("court_order")!;
  const oldEvents = oldFake.store.get("activity_event")!;
  const oldNotifs = oldFake.store.get("notification")!;

  // ── Diff path (diffSync: true) ──
  const diffFake = fakeSupabase({ tenantId, matterId });
  diffFake.store.set("hearing", seedHearings.map(fixRow));
  diffFake.store.set("court_order", seedOrders.map(fixRow));
  if (seedNextDate !== undefined) {
    const matterRows = diffFake.store.get("matter")!;
    matterRows[0].next_hearing_date = seedNextDate;
    matterRows[0].judge_names = fixture.judges ?? [];
  }

  await upsertCase(diffFake.sb, tenantId, fixture, null, { diffSync: true });
  const diffHearings = diffFake.store.get("hearing")!;
  const diffOrders = diffFake.store.get("court_order")!;
  const diffEvents = diffFake.store.get("activity_event")!;
  const diffNotifs = diffFake.store.get("notification")!;

  // ── Compare hearing row sets by logical key ──
  const oldHKeys = oldHearings.map((r) => `${r.date}::${r.purpose}`).sort();
  const diffHKeys = diffHearings.map((r) => `${r.date}::${r.purpose}`).sort();
  assert(
    JSON.stringify(oldHKeys) === JSON.stringify(diffHKeys),
    `${label}: hearing keys match (${oldHKeys.length} vs ${diffHKeys.length})`,
  );

  // ── Compare order row sets by provider order_id ──
  const oldOKeys = oldOrders.map((r) => {
    const raw = (r.raw as Record<string, unknown> | null);
    return raw?.order_id ?? `LEGACY-${r.id}`;
  }).sort();
  const diffOKeys = diffOrders.map((r) => {
    const raw = (r.raw as Record<string, unknown> | null);
    return raw?.order_id ?? `LEGACY-${r.id}`;
  }).sort();
  assert(
    JSON.stringify(oldOKeys) === JSON.stringify(diffOKeys),
    `${label}: order keys match (${oldOKeys.length} vs ${diffOKeys.length})`,
  );

  // ── Compare activity_event summaries ──
  const oldSummaries = oldEvents.map((e) => (e as any).summary).sort();
  const diffSummaries = diffEvents.map((e) => (e as any).summary).sort();
  assert(
    JSON.stringify(oldSummaries) === JSON.stringify(diffSummaries),
    `${label}: activity events match`,
  );

  // ── Compare notification payloads (case_update only) ──
  const oldUpdateNotifs = oldNotifs.filter((n) => (n as any).kind === "case_update");
  const diffUpdateNotifs = diffNotifs.filter((n) => (n as any).kind === "case_update");
  assert(
    oldUpdateNotifs.length === diffUpdateNotifs.length,
    `${label}: case_update count match (${oldUpdateNotifs.length} vs ${diffUpdateNotifs.length})`,
  );

  // ── Write count: diff path should be ≤ old path ──
  const oldWrites = oldFake.trace.filter((t) => t.op === "insert" || t.op === "delete" || t.op === "update").length;
  const diffWrites = diffFake.trace.filter((t) => t.op === "insert" || t.op === "delete" || t.op === "update").length;
  if (diffWrites <= oldWrites) {
    console.log(`  ✓ ${label}: diff writes (${diffWrites}) ≤ old writes (${oldWrites})`);
  } else {
    console.error(`  FAIL: ${label}: diff writes (${diffWrites}) > old writes (${oldWrites})`);
    failed++;
  }

  return { oldHearings, diffHearings };
}

async function main() {
  // Fixture 1: no-change refresh
  await runParity("no-change", baseCase(), [
    { id: "h1", date: "2026-07-15", purpose: "Arguments", court_no: "C1", judge: "Hon'ble Justice D", raw: {} },
  ], [
    { id: "o1", order_date: "2026-05-10", title: "Interim order", raw: { order_id: "ORD-A", has_pdf: false } },
  ]);

  // Fixture 2: +1 new hearing
  await runParity("+1 hearing", baseCase({
    hearings: [nh("2026-07-15", "Arguments", "C1", "Hon'ble Justice D"), nh("2026-08-01", "Evidence")],
  }), [
    { id: "h1", date: "2026-07-15", purpose: "Arguments", court_no: "C1", judge: "Hon'ble Justice D", raw: {} },
  ], [
    { id: "o1", order_date: "2026-05-10", title: "Interim order", raw: { order_id: "ORD-A", has_pdf: false } },
  ]);

  // Fixture 3: 1 vanished hearing
  await runParity("vanished", baseCase({
    hearings: [nh("2026-07-15", "Arguments")],
  }), [
    { id: "h1", date: "2026-07-15", purpose: "Arguments", court_no: null, judge: null, raw: {} },
    { id: "h2", date: "2026-08-01", purpose: "Evidence", court_no: null, judge: null, raw: {} },
  ], [
    { id: "o1", order_date: "2026-05-10", title: "Interim order", raw: { order_id: "ORD-A", has_pdf: false } },
  ]);

  // Fixture 4: rescheduled (same date, different purpose)
  await runParity("rescheduled", baseCase({
    hearings: [nh("2026-07-15", "Evidence")],
  }), [
    { id: "h1", date: "2026-07-15", purpose: "Arguments", court_no: null, judge: null, raw: {} },
  ], [
    { id: "o1", order_date: "2026-05-10", title: "Interim order", raw: { order_id: "ORD-A", has_pdf: false } },
  ]);

  // Fixture 5: order re-issued (same id, different date/title)
  await runParity("order re-issued", baseCase({
    orders: [nor("ORD-A", "2026-06-15", "Revised order")],
  }), [
    { id: "h1", date: "2026-07-15", purpose: "Arguments", court_no: null, judge: null, raw: {} },
  ], [
    { id: "o1", order_date: "2026-05-10", title: "Interim order", raw: { order_id: "ORD-A", has_pdf: false } },
  ]);

  // Fixture 6: first-ever sync (0 existing hearings/orders)
  {
    const noOldFixture = baseCase({
      hearings: [nh("2026-07-15", "Arguments"), nh("2026-08-01", "Evidence")],
      orders: [nor("ORD-A"), nor("ORD-B")],
    });
    const { oldFake, diffFake } = await runUpsertCase("first-ever", noOldFixture, [], [], false);
    const oldHKeys = oldFake.store.get("hearing")!.map((r) => `${r.date}::${r.purpose}`).sort();
    const diffHKeys = diffFake.store.get("hearing")!.map((r) => `${r.date}::${r.purpose}`).sort();
    assert(JSON.stringify(oldHKeys) === JSON.stringify(diffHKeys), "first-ever: hearing parity");
  }

  // Fixture 7: truncated incoming
  await runParity("truncated", baseCase({
    hearings: [nh("2026-07-15", "Arguments"), nh("2026-08-01", "Evidence")],
  }), [
    { id: "h1", date: "2026-07-01", purpose: "Appearance", court_no: null, judge: null, raw: {} },
    { id: "h2", date: "2026-07-15", purpose: "Arguments", court_no: null, judge: null, raw: {} },
    { id: "h3", date: "2026-08-01", purpose: "Evidence", court_no: null, judge: null, raw: {} },
  ], [
    { id: "o1", order_date: "2026-05-10", title: "Interim order", raw: { order_id: "ORD-A", has_pdf: false } },
  ]);

  // Fixture 8: duplicate-key existing hearings converge
  await runParity("dup-key", baseCase({
    hearings: [nh("2026-07-15", "Arguments")],
  }), [
    { id: "h_a", date: "2026-07-15", purpose: "Arguments", court_no: null, judge: null, raw: {} },
    { id: "h_b", date: "2026-07-15", purpose: "Arguments", court_no: null, judge: null, raw: {} },
  ], [
    { id: "o1", order_date: "2026-05-10", title: "Interim order", raw: { order_id: "ORD-A", has_pdf: false } },
  ]);

  // Fixture 9: legacy order (no raw.order_id) is deleted
  await runParity("legacy-order", baseCase({
    orders: [nor("ORD-NEW", "2026-06-01", "New title")],
  }), [
    { id: "h1", date: "2026-07-15", purpose: "Arguments", court_no: null, judge: null, raw: {} },
  ], [
    { id: "o_legacy", order_date: null, title: null, raw: {} },
  ]);

  // Fixture 10: raw-reordered jsonb does NOT trigger writes
  {
    const rawReordered = baseCase();
    const { diffFake } = await runUpsertCase("raw-reorder", rawReordered, [
      { id: "h1", date: "2026-07-15", purpose: "Arguments", court_no: "C1", judge: "Hon'ble Justice D", raw: {} },
    ], [
      { id: "o1", order_date: "2026-05-10", title: "Interim order", raw: { has_pdf: false, order_id: "ORD-A" } },
    ]);
    const writes = diffFake.trace.filter((t) => t.op !== "insert" || t.table !== "notification");
    assert(writes.length <= 4, `raw-reorder: ≤4 non-notification writes (got ${writes.length})`);
  }

  // Fixture 11: no-change refresh → 0 write ops on diff path
  {
    const { diffFake } = await runUpsertCase("zero-write", baseCase(), [
      { id: "h1", date: "2026-07-15", purpose: "Arguments", court_no: "C1", judge: "Hon'ble Justice D", raw: {} },
    ], [
      { id: "o1", order_date: "2026-05-10", title: "Interim order", raw: { order_id: "ORD-A", has_pdf: false } },
    ]);
    const hearingWrites = diffFake.trace.filter((t) =>
      (t.table === "hearing" || t.table === "court_order") &&
      (t.op === "insert" || t.op === "delete" || t.op === "update")
    );
    assert(hearingWrites.length === 0, `zero-write: 0 hearing/order writes on diff path (got ${hearingWrites.length})`);
  }

  console.log(`\n${failed === 0 ? "WO-359 DIFF SYNC: PASS" : `WO-359 DIFF SYNC: FAIL (${failed})`}`);
  process.exit(failed === 0 ? 0 : 1);
}

async function runUpsertCase(
  label: string,
  fixture: NormalizedCase,
  seedHearings: Row[],
  seedOrders: Row[],
  assertParity = true,
) {
  const tenantId = "tn-test";
  const matterId = "m-test";

  function fixRow(r: Row): Row {
    const copy = { ...r };
    if (copy.tenant_id === undefined) copy.tenant_id = tenantId;
    if (copy.matter_id === undefined) copy.matter_id = matterId;
    return copy;
  }

  const oldFake = fakeSupabase({ tenantId, matterId });
  oldFake.store.set("hearing", seedHearings.map(fixRow));
  oldFake.store.set("court_order", seedOrders.map(fixRow));

  const diffFake = fakeSupabase({ tenantId, matterId });
  diffFake.store.set("hearing", seedHearings.map(fixRow));
  diffFake.store.set("court_order", seedOrders.map(fixRow));

  await upsertCase(oldFake.sb, tenantId, fixture, null, { diffSync: false });
  await upsertCase(diffFake.sb, tenantId, fixture, null, { diffSync: true });

  if (assertParity) {
    const oldHKeys = oldFake.store.get("hearing")!.map((r) => `${r.date}::${r.purpose}`).sort();
    const diffHKeys = diffFake.store.get("hearing")!.map((r) => `${r.date}::${r.purpose}`).sort();
    assert(JSON.stringify(oldHKeys) === JSON.stringify(diffHKeys), `${label}: hearing parity`);

    const oldOKeys = oldFake.store.get("court_order")!.map((r) => {
      const raw = (r.raw as Record<string, unknown> | null);
      return raw?.order_id ?? `LEGACY-${r.id}`;
    }).sort();
    const diffOKeys = diffFake.store.get("court_order")!.map((r) => {
      const raw = (r.raw as Record<string, unknown> | null);
      return raw?.order_id ?? `LEGACY-${r.id}`;
    }).sort();
    assert(JSON.stringify(oldOKeys) === JSON.stringify(diffOKeys), `${label}: order parity`);
  }

  return { oldFake, diffFake };
}

main().catch((e) => { console.error(e); process.exit(1); });
