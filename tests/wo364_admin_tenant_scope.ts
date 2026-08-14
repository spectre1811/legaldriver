// WO-364 W1 · adminFor(tenantId) — proving a cross-tenant read/write is ACTUALLY REFUSED,
// not just that the outgoing request happens to carry a WHERE clause.
//
// The service-role admin client bypasses RLS entirely — there is no database-side backstop
// here, only adminFor()'s own filtering. So the fake PostgREST below is STATEFUL: it holds
// real rows from TWO tenants and enforces `eq.` filters the way Postgres actually would
// (AND across every filter in the query string; PATCH/DELETE only touch matching rows). That
// is the difference from a weak test: if `adminFor()`'s `.eq("tenant_id", …)` were ever
// deleted, this store would hand back tenant B's rows to a tenant-A caller — and the checks
// below would fail on DATA, not on an inspected query string. (Run it with that line deleted
// to see it fail — that's the "survives a deletion experiment" bar.)
//
// Run: npx tsx tests/wo364_admin_tenant_scope.ts
import type { Database } from "../src/lib/db/database.types";

let failed = 0;
function check(label: string, cond: boolean, extra?: unknown) {
  if (cond) {
    console.log(`ok  : ${label}`);
  } else {
    failed++;
    console.error(`FAIL: ${label}${extra === undefined ? "" : ` — ${JSON.stringify(extra)}`}`);
  }
}

// ── A minimal but STATEFUL PostgREST fake ───────────────────────────────────────────
// Real filtering semantics (every `col=eq.val` query param ANDs together), real mutation
// (PATCH/DELETE only touch matching rows, in place) — the property this test needs.
type Row = Record<string, unknown>;
const store = new Map<string, Row[]>();
const calls: { method: string; table: string; url: string }[] = [];

function seed(table: string, rows: Row[]) {
  store.set(table, [...(store.get(table) ?? []), ...rows]);
}
function tableRows(table: string): Row[] {
  return store.get(table) ?? [];
}

function eqFilters(url: URL): [string, string][] {
  const reserved = new Set(["select", "order", "limit", "offset", "on_conflict"]);
  const out: [string, string][] = [];
  for (const [k, v] of url.searchParams) {
    if (reserved.has(k)) continue;
    const m = /^eq\.(.*)$/.exec(v);
    if (m) out.push([k, m[1]]);
  }
  return out;
}
function matches(row: Row, filters: [string, string][]): boolean {
  return filters.every(([col, val]) => String(row[col]) === val);
}

let nextId = 1;
const jsonRes = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

function installFetchStub() {
  globalThis.fetch = (async (input: unknown, init?: { method?: string; body?: unknown }) => {
    const rawUrl = typeof input === "string" ? input : ((input as { url?: string })?.url ?? String(input));
    const url = new URL(rawUrl);
    const method = (init?.method ?? "GET").toUpperCase();
    const m = /\/rest\/v1\/([a-z_]+)/.exec(url.pathname);
    const table = m ? m[1] : "__unknown__";
    calls.push({ method, table, url: rawUrl });
    const filters = eqFilters(url);
    const rows = tableRows(table);

    if (method === "GET") {
      return jsonRes(rows.filter((r) => matches(r, filters)));
    }
    if (method === "POST") {
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      const incoming = Array.isArray(body) ? body : [body];
      const created = incoming.map((r) => ({ id: r.id ?? `row-${nextId++}`, ...r }));
      seed(table, created);
      return jsonRes(created, 201);
    }
    if (method === "PATCH") {
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      const updated: Row[] = [];
      for (const r of rows) {
        if (matches(r, filters)) {
          Object.assign(r, body);
          updated.push(r);
        }
      }
      return jsonRes(updated);
    }
    if (method === "DELETE") {
      const kept = rows.filter((r) => !matches(r, filters));
      const removed = rows.filter((r) => matches(r, filters));
      store.set(table, kept);
      return jsonRes(removed);
    }
    return jsonRes([], 200);
  }) as unknown as typeof fetch;
}

async function main() {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://stub.supabase.test";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-stub";
  installFetchStub();

  const { adminFor, createAdminClient } = await import("@/lib/supabase/admin");

  const TENANT_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  const TENANT_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

  // Seed BOTH tenants directly into the store (bypassing the wrapper — this is the raw
  // fixture data an unscoped admin client would see in full).
  seed("client", [
    { id: "client-a1", tenant_id: TENANT_A, name: "Alpha Client" },
    { id: "client-b1", tenant_id: TENANT_B, name: "Bravo Client" },
  ]);

  // ── Baseline: prove the store genuinely holds BOTH tenants (so a filtered result
  //    below is provably the wrapper's doing, not "there was nothing to leak"). ──────
  const raw = createAdminClient();
  const { data: everything } = await raw.from("client").select("id,tenant_id");
  check(
    "fixture sanity: the raw admin client sees BOTH tenants' rows",
    (everything ?? []).length === 2 && (everything ?? []).some((r) => r.tenant_id === TENANT_B),
    everything,
  );

  // ── (1) Cross-tenant READ refused ───────────────────────────────────────────────
  const scopedA = adminFor(TENANT_A);
  const { data: seenByA } = await scopedA.from("client").select("id,tenant_id,name");
  check("tenant A's scoped read returns exactly 1 row (its own)", (seenByA ?? []).length === 1, seenByA);
  check(
    "tenant A's scoped read NEVER includes tenant B's row",
    !(seenByA ?? []).some((r) => r.tenant_id === TENANT_B),
    seenByA,
  );
  check("tenant A's scoped read returns tenant A's own row", (seenByA ?? [])[0]?.id === "client-a1", seenByA);

  // ── (2) Cross-tenant WRITE (insert) can't plant data under another tenant ──────
  // A buggy/compromised call site tries to hand adminFor() an explicit WRONG tenant_id.
  // The stamp must win — the caller's real tenantId, not whatever was in the payload.
  await scopedA.from("client").insert({
    id: "client-a2",
    name: "Attempted spoof",
    tenant_id: TENANT_B,
  } as unknown as Database["public"]["Tables"]["client"]["Insert"]);
  const { data: spoofRow } = await raw.from("client").select("tenant_id").eq("id", "client-a2").maybeSingle();
  check(
    "insert via adminFor(A) is stamped tenant A, even when the payload claimed tenant B",
    spoofRow?.tenant_id === TENANT_A,
    spoofRow,
  );

  // ── (3) Cross-tenant WRITE (update) refused ─────────────────────────────────────
  const { data: updated } = await scopedA
    .from("client")
    .update({ name: "HACKED" })
    .eq("id", "client-b1");
  check("update via adminFor(A) targeting tenant B's row by id affects ZERO rows", (updated ?? []).length === 0, updated);
  const { data: bAfterUpdate } = await raw.from("client").select("name").eq("id", "client-b1").maybeSingle();
  check("tenant B's row is UNCHANGED after tenant A's update attempt", bAfterUpdate?.name === "Bravo Client", bAfterUpdate);

  // ── (3b) Cross-tenant WRITE (reparent-by-update) refused ────────────────────────
  // The WHERE clause alone isn't the whole guarantee: a caller can target its OWN row
  // (passes the .eq("id", …) + .eq("tenant_id", A) filter) but try to hand it to another
  // tenant via the payload itself. update() must stamp tenant_id like insert/upsert does,
  // not pass the payload through verbatim (round-2 review finding).
  await scopedA.from("client").update({ tenant_id: TENANT_B, name: "reparented" }).eq("id", "client-a1");
  const { data: a1AfterReparent } = await raw.from("client").select("tenant_id,name").eq("id", "client-a1").maybeSingle();
  check(
    "update via adminFor(A) on A's OWN row cannot reparent it to tenant B via the payload",
    a1AfterReparent?.tenant_id === TENANT_A,
    a1AfterReparent,
  );
  check("...but the rest of the update DID apply (it's a stamp, not a silent no-op)", a1AfterReparent?.name === "reparented", a1AfterReparent);

  // ── (4) Cross-tenant WRITE (delete) refused ─────────────────────────────────────
  const { data: deleted } = await scopedA.from("client").delete().eq("id", "client-b1");
  check("delete via adminFor(A) targeting tenant B's row by id affects ZERO rows", (deleted ?? []).length === 0, deleted);
  const { data: bStillThere } = await raw.from("client").select("id").eq("id", "client-b1").maybeSingle();
  check("tenant B's row still EXISTS after tenant A's delete attempt", bStillThere?.id === "client-b1", bStillThere);

  // ── (5) Secondary/diagnostic: the outgoing requests do carry the filter ────────
  // (Weak on its own per the WO note — kept only as a cheap extra signal now that (1)-(4)
  // already prove the behavior on real data. Insert doesn't appear here: tenant_id is
  // stamped into the BODY for a POST, not the query string.)
  const scopedCalls = calls.filter((c) => c.table === "client" && c.url.includes(`tenant_id=eq.${TENANT_A}`));
  check("select/update(x2)/delete via adminFor(A) all carried tenant_id=eq.<A> on the wire", scopedCalls.length === 4, scopedCalls.length);

  // ── (6) TenantTable excludes tables with no tenant_id column (compile-time) ─────
  // court_provider_health has no tenant_id — adminFor().from(...) must refuse it at the
  // type level, not just at runtime. If this stops being a type error (e.g. someone widens
  // TenantTable), `npm run typecheck` fails on a missing @ts-expect-error.
  // @ts-expect-error — court_provider_health has no tenant_id; not a TenantTable
  adminFor(TENANT_A).from("court_provider_health");

  console.log(`\n==== WO-364 adminFor tenant scope: ${failed === 0 ? "PASS" : `${failed} FAILURE(S)`} ====`);
  if (failed) process.exit(1);
}

main().catch((e) => {
  console.error("WO-364 TEST ERROR:", e);
  process.exit(1);
});
