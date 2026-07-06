// WO-65 · Onboarding must import the FULL roster (not a token slice) and show honest "N of M" coverage.
// Offline, no DB/network — a compact fake Supabase records inserts so we can lock the two behaviours the
// WO turns on:
//   1. seedFetchedMatters seeds the FULL roster (old 80-cap gone) in BULK, de-duped, and is IDEMPOTENT
//      (a re-run seeds 0) — so a 257-case advocate ends with 257 matters, and re-running never doubles.
//   2. onboardingCoverage / onboardingCountsSummary compute the honest "M cases on file · N of M
//      detailed" math from the run counts — including the roster_total (M) the fetch stage now records.
// Run: npx tsx tests/wo65_full_roster.ts
import { seedFetchedMatters } from "../src/lib/services/onboarding/orchestrator";
import { onboardingCoverage, onboardingCountsSummary } from "../src/lib/services/onboarding/progress";
import type { FetchedAdvocateCase } from "../src/lib/court/advocate-cases";

let failures = 0;
const check = (name: string, cond: boolean) => { console.log(`${cond ? "PASS" : "FAIL"}  ${name}`); if (!cond) failures++; };

// ── A compact fake Supabase (just the `matter` calls seedFetchedMatters makes) ──────────────────────
// Records inserts; simulates the (tenant_id, cnr) existence check via a shared set so idempotency and
// bulk-vs-fallback behaviour are exercised deterministically without a real DB. `failBulk` forces the
// bulk `.insert([...])` to error so the per-row fallback path is covered.
function fakeSupabase(opts: { existing?: string[]; failBulk?: boolean } = {}) {
  const existing = new Set(opts.existing ?? []);
  const inserted: Record<string, unknown>[] = [];
  let idc = 0;
  const from = () => {
    const st: { op?: string; cols?: string; inVals?: string[]; payload?: unknown } = {};
    const builder: Record<string, unknown> = {
      select(cols: string) { st.cols = cols; return builder; },
      eq() { return builder; },
      ilike() { st.op = "ilike"; return builder; },
      in(_k: string, vals: string[]) { st.op = "in"; st.inVals = vals; return builder; },
      maybeSingle() { st.op = st.op ?? "single"; return builder; },
      insert(payload: unknown) { st.op = "insert"; st.payload = payload; return builder; },
      then(res: (v: unknown) => unknown, rej: (e: unknown) => unknown) {
        return Promise.resolve(resolve()).then(res, rej);
      },
    };
    function resolve() {
      if (st.op === "in") return { data: (st.inVals ?? []).filter((c) => existing.has(c)).map((c) => ({ cnr: c })), error: null };
      if (st.op === "ilike" || st.op === "single") return { data: null, error: null };
      if (st.op === "insert") {
        const rows = (Array.isArray(st.payload) ? st.payload : [st.payload]) as Record<string, unknown>[];
        // Bulk insert = an array payload WITH a `.select("id")`; force it to error when asked.
        if (opts.failBulk && Array.isArray(st.payload) && st.cols) return { data: null, error: { message: "duplicate key" } };
        for (const r of rows) { inserted.push(r); if (typeof r.cnr === "string") existing.add(r.cnr); }
        return { data: st.cols ? rows.map(() => ({ id: `m${idc++}` })) : null, error: null };
      }
      return { data: null, error: null };
    }
    return builder;
  };
  return { db: { from } as unknown as Parameters<typeof seedFetchedMatters>[0], inserted, existing };
}

const mkCase = (cnr: string, over: Partial<FetchedAdvocateCase> = {}): FetchedAdvocateCase =>
  ({ cnr, title: `Case ${cnr}`, court: "HC", status: "Pending", nextHearingDate: null, parties: [], decided: false, source: "legaldriver", ...over });

async function main() {
  // ── 1. Full roster lands (the 80-cap is gone) ──────────────────────────────────────────────────
  {
    const roster = Array.from({ length: 257 }, (_, i) => mkCase(`GJHC${String(i).padStart(6, "0")}2026`));
    const { db, inserted } = fakeSupabase();
    const seeded = await seedFetchedMatters(db, "t1", roster);
    check("257-case roster seeds all 257 (no 80-cap)", seeded === 257 && inserted.length === 257);
  }

  // ── 2. Idempotent re-run seeds nothing (shared existence set) ───────────────────────────────────
  {
    const roster = Array.from({ length: 120 }, (_, i) => mkCase(`GJHC${String(i).padStart(6, "0")}2026`));
    const fake = fakeSupabase();
    const first = await seedFetchedMatters(fake.db, "t1", roster);
    const second = await seedFetchedMatters(fake.db, "t1", roster); // same rows already present now
    check("first run seeds full roster", first === 120);
    check("idempotent re-run seeds 0 (no duplicates)", second === 0 && fake.inserted.length === 120);
  }

  // ── 3. Only genuinely-NEW cases seed when some already exist ─────────────────────────────────────
  {
    const roster = [mkCase("GJHC01"), mkCase("GJHC02"), mkCase("GJHC03")];
    const { db } = fakeSupabase({ existing: ["GJHC02"] });
    const seeded = await seedFetchedMatters(db, "t1", roster);
    check("partial-existing → only the 2 new seed", seeded === 2);
  }

  // ── 4. Duplicate CNRs within one input batch collapse to a single insert ─────────────────────────
  {
    const roster = [mkCase("GJHC09"), mkCase("GJHC09"), mkCase("GJHC10")];
    const { db, inserted } = fakeSupabase();
    const seeded = await seedFetchedMatters(db, "t1", roster);
    check("in-batch duplicate CNR de-duped", seeded === 2 && inserted.length === 2);
  }

  // ── 5. Bulk-insert failure falls back to per-row (never drops the whole batch) ───────────────────
  {
    const roster = [mkCase("GJHC21"), mkCase("GJHC22"), mkCase("GJHC23")];
    const { db } = fakeSupabase({ failBulk: true });
    const seeded = await seedFetchedMatters(db, "t1", roster);
    check("bulk error → per-row fallback still seeds all", seeded === 3);
  }

  // ── 6. Coverage math — roster_total (M) drives honest "N of M" ──────────────────────────────────
  {
    const cov = onboardingCoverage({ roster_total: 257, enriched: 120, cases_fetched: 257, matters_seeded: 0 });
    check("coverage: total=M, onFile=M once seeded", cov.total === 257 && cov.onFile === 257);
    check("coverage: detailed=E, filling while E<M", cov.detailed === 120 && cov.filling === true);

    const done = onboardingCoverage({ roster_total: 257, enriched: 300 });
    check("coverage: detailed capped at M, not filling when all detailed", done.detailed === 257 && done.filling === false);

    const reRun = onboardingCoverage({ roster_total: 257, enriched: 0, cases_fetched: 0 });
    check("coverage: re-run (cases_fetched=0) still shows M on file", reRun.onFile === 257);

    const noTotal = onboardingCoverage({ cases_fetched: 40, matters_seeded: 3 });
    check("coverage: no roster_total → fall back to seeded-this-run", noTotal.total === 0 && noTotal.onFile === 43);
  }

  // ── 7. Summary string reads honestly ────────────────────────────────────────────────────────────
  {
    const filling = onboardingCountsSummary({ roster_total: 257, enriched: 120, deadlines_proposed: 4 });
    check("summary leads with 'M cases on file'", filling.startsWith("257 cases on file"));
    check("summary shows 'N of M detailed' while filling", filling.includes("120 of 257 detailed"));
    check("summary appends deadlines", filling.includes("4 deadlines"));

    const complete = onboardingCountsSummary({ roster_total: 10, enriched: 10 });
    check("summary says 'all details in' when fully enriched", complete.includes("all details in") && !complete.includes("of 10"));

    const early = onboardingCountsSummary({ cases_fetched: 0, matters_seeded: 0 });
    check("summary empty early (never a false '0 cases')", early === "");

    const singular = onboardingCountsSummary({ roster_total: 1, enriched: 0 });
    check("summary singular grammar", singular === "1 case on file");
  }
}

main().then(() => {
  console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}).catch((e) => { console.error(e); process.exit(1); });
