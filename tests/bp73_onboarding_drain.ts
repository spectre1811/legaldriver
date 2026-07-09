// BP-73: the resumable onboarding drain state machine. Offline, no secrets, deterministic (injected
// clock + fake step). Proves the control logic that lets a large roster complete WITHOUT ever running
// the whole pipeline in one server action (Vercel Hobby's 60s cap): stage ordering, enrich chunking,
// budget-stop leaving resumable state, resume-from-persisted-stage, and idempotency after done.
// Run: npx tsx tests/bp73_onboarding_drain.ts
import {
  driveDrain, enrichChunk, nextStage, normalizeCounts, emptyCounts, preserveFetch,
  boundStep, STEP_TIMED_OUT, PIPELINE_STAGES, ENRICH_CHUNK,
  type DrainState, type StepFn, type StepResult, type StepRace,
} from "../src/lib/services/onboarding/drain";

let failures = 0;
const check = (name: string, cond: boolean) => { console.log(`${cond ? "PASS" : "FAIL"}  ${name}`); if (!cond) failures++; };

async function main() {
// ── nextStage: exact pipeline order + queued/unknown/terminal handling ──
check("queued → first stage", nextStage("queued") === "causelist");
check("unknown → first stage", nextStage("wat") === "causelist");
check("causelist → fetch", nextStage("causelist") === "fetch");
check("fetch → enrich", nextStage("fetch") === "enrich");
check("summaries → done (pipeline exhausted)", nextStage("summaries") === "done");
check("done → done (terminal, stable)", nextStage("done") === "done");
check("PIPELINE_STAGES excludes done", !(PIPELINE_STAGES as readonly string[]).includes("done"));

// ── enrichChunk: slice/offset/more arithmetic (the resume cursor) ──
const cnrs12 = Array.from({ length: 12 }, (_, i) => `CNR${i}`);
const c0 = enrichChunk(cnrs12, 0);
check("chunk 0 = first ENRICH_CHUNK, more", c0.chunk.length === ENRICH_CHUNK && c0.nextOffset === ENRICH_CHUNK && c0.more);
const cMid = enrichChunk(cnrs12, 10);
check("chunk at 10 = last 2, no more", cMid.chunk.length === 2 && cMid.nextOffset === 12 && !cMid.more);
check("chunk at end = empty, no more", enrichChunk(cnrs12, 12).chunk.length === 0 && !enrichChunk(cnrs12, 12).more);
check("chunk beyond end = empty, no more", enrichChunk(cnrs12, 99).chunk.length === 0 && !enrichChunk(cnrs12, 99).more);
check("empty roster = empty, no more", enrichChunk([], 0).chunk.length === 0 && !enrichChunk([], 0).more);
check("negative offset clamps to 0", enrichChunk(cnrs12, -5).nextOffset === ENRICH_CHUNK);

// ── normalizeCounts: robust to partial/garbage persisted JSON ──
const n = normalizeCounts({ enriched: 7, junk: "x", cases_fetched: "3" });
check("normalizeCounts keeps numbers, drops junk/strings", n.enriched === 7 && n.cases_fetched === 0 && n.deadlines_proposed === 0);
check("normalizeCounts(null) = zeros", normalizeCounts(null).enriched === 0);

// ── preserveFetch: keeps the fetch flags across a stage advance, drops enrich cursor ──
const pf = preserveFetch({ fetch_pending: true, fetch_started_at: "t", enrich_offset: 10, enrich_cnrs: ["a"] });
check("preserveFetch keeps fetch flags", pf.fetch_pending === true && pf.fetch_started_at === "t");
check("preserveFetch drops enrich cursor", pf.enrich_offset === undefined && pf.enrich_cnrs === undefined);
// WO-91: the skip record survives the per-stage cursor reset (honest completed run).
const pfSkip = preserveFetch({ enrich_offset: 3, timed_out_stages: ["closed"] });
check("preserveFetch carries timed_out_stages across an advance", Array.isArray(pfSkip.timed_out_stages) && (pfSkip.timed_out_stages as string[])[0] === "closed" && pfSkip.enrich_offset === undefined);

// ── A fake step: enrich chunks a fixed roster; other stages advance once. Optional clock burn. ──
function fakeStep(cnrs: string[], clock?: { t: number }, stepMs = 0): { step: StepFn; visited: string[] } {
  const visited: string[] = [];
  const step: StepFn = async (stage, state) => {
    visited.push(stage);
    if (clock) clock.t += stepMs;
    const counts = state.counts;
    if (stage === "enrich") {
      const offset = typeof state.cursor.enrich_offset === "number" ? state.cursor.enrich_offset : 0;
      const { chunk, nextOffset, more } = enrichChunk(cnrs, offset);
      counts.enriched += chunk.length;
      return { counts, cursor: { ...state.cursor, enrich_offset: nextOffset }, more };
    }
    if (stage === "fetch") {
      counts.cases_fetched += cnrs.length;
      return { counts, cursor: { ...state.cursor, fetch_pending: true }, more: false, message: "still fetching…" } satisfies StepResult;
    }
    return { counts, cursor: state.cursor, more: false };
  };
  return { step, visited };
}

const fresh = (): DrainState => ({ stage: "queued", cursor: {}, counts: emptyCounts(), message: null });
function recorder() {
  const persisted: Array<{ stage: string; enriched: number; offset: unknown; message: string | null; done: boolean }> = [];
  const persist = async (s: DrainState, done: boolean) => {
    persisted.push({ stage: s.stage, enriched: s.counts.enriched, offset: s.cursor.enrich_offset, message: s.message, done });
  };
  return { persisted, persist };
}

// ── A: unbounded budget drains a 12-CNR roster fully to done ──
{
  const { step, visited } = fakeStep(cnrs12);
  const { persisted, persist } = recorder();
  const { state, done } = await driveDrain(fresh(), step, { budgetMs: Number.POSITIVE_INFINITY, now: () => 0, persist });
  check("A: reaches done", done && state.stage === "done");
  check("A: every CNR enriched exactly once", state.counts.enriched === 12);
  check("A: enrich ran ⌈12/chunk⌉ chunks", visited.filter((s) => s === "enrich").length === Math.ceil(cnrs12.length / ENRICH_CHUNK));
  check("A: each pipeline stage visited", PIPELINE_STAGES.every((s) => visited.includes(s)));
  check("A: last persist marks done", persisted[persisted.length - 1].done === true && persisted[persisted.length - 1].stage === "done");
  check("A: fetch message persisted", persisted.some((p) => p.message === "still fetching…"));
}

// ── B: a tight budget stops MID-enrich, leaving resumable state; a resume finishes with no loss/dup ──
{
  const clock = { t: 0 };
  const { step, visited } = fakeStep(cnrs12, clock, 30);      // each step burns 30ms
  const { persisted, persist } = recorder();
  const first = await driveDrain(fresh(), step, { budgetMs: 100, now: () => clock.t, persist });
  // budget 100, 30ms/step → checks pass at 0,30,60,90 then stop → 4 steps: causelist, fetch, enrich, enrich
  const twoChunks = 2 * ENRICH_CHUNK;
  check("B: stopped, not done", !first.done && first.state.stage === "enrich");
  check("B: partial enrich = two chunks", first.state.counts.enriched === twoChunks && first.state.cursor.enrich_offset === twoChunks);
  check("B: exactly 4 steps ran before budget", visited.length === 4);
  const lastPersist = persisted[persisted.length - 1];
  check("B: persisted state is resumable (enrich mid-way)", lastPersist.stage === "enrich" && lastPersist.offset === twoChunks && lastPersist.done === false);

  // Resume from EXACTLY what was persisted (fresh clock + unbounded budget, same roster).
  const resumeState: DrainState = { stage: lastPersist.stage, cursor: { enrich_offset: lastPersist.offset as number }, counts: normalizeCounts({ enriched: lastPersist.enriched }), message: null };
  const { step: step2, visited: v2 } = fakeStep(cnrs12);
  const rec2 = recorder();
  const second = await driveDrain(resumeState, step2, { budgetMs: Number.POSITIVE_INFINITY, now: () => 0, persist: rec2.persist });
  check("B: resume reaches done", second.done && second.state.stage === "done");
  check("B: total enriched = 12 (no double-count, no skip)", second.state.counts.enriched === 12);
  check("B: resume finished the last enrich chunk then advanced", v2[0] === "enrich" && v2.includes("summaries"));
}

// ── C: idempotent — driving an already-done run does nothing ──
{
  let calls = 0;
  const step: StepFn = async (_s, st) => { calls++; return { counts: st.counts, cursor: st.cursor, more: false }; };
  const rec = recorder();
  const res = await driveDrain({ stage: "done", cursor: {}, counts: emptyCounts(), message: null }, step, { budgetMs: 1000, now: () => 0, persist: rec.persist });
  check("C: done stays done, no work, no step calls", res.done && calls === 0 && rec.persisted.length === 0);
}

// ── D: a zero-budget call makes no progress but never throws (cron backstop safety) ──
{
  const { step } = fakeStep(cnrs12);
  const rec = recorder();
  const res = await driveDrain(fresh(), step, { budgetMs: 0, now: () => 0, persist: rec.persist });
  check("D: zero budget → no progress, not done, no throw", !res.done && res.state.stage === "causelist" && rec.persisted.length === 0);
}

// ── E (WO-91): boundStep passes a healthy step through, but ADVANCES + records on a timeout ──
{
  const passThrough: StepFn = async (_s, st) => ({ counts: st.counts, cursor: st.cursor, more: false });
  const neverTimesOut: StepRace = async (p) => p;              // handler always wins the race
  const alwaysTimesOut: StepRace = async () => STEP_TIMED_OUT; // the hang case (deterministic stub)
  const at: DrainState = { stage: "closed", cursor: { keepme: 1 }, counts: emptyCounts(), message: null };

  const ok = await boundStep(passThrough, 12_000, neverTimesOut)("closed", at);
  check("E: healthy step passes through unchanged", ok.more === false && ok.cursor.keepme === 1 && ok.cursor.timed_out_stages === undefined);

  const to = await boundStep(passThrough, 12_000, alwaysTimesOut)("closed", at);
  check("E: timeout advances the stage (more:false)", to.more === false);
  check("E: timeout records the skipped stage", Array.isArray(to.cursor.timed_out_stages) && (to.cursor.timed_out_stages as string[]).includes("closed"));
  check("E: timeout leaves counts untouched", JSON.stringify(to.counts) === JSON.stringify(emptyCounts()));
}

// ── F (WO-91): the real wedge — `closed`+`inbox` hang, the rest run; the run STILL reaches done ──
{
  // Deterministic stand-in for the real setTimeout race: the step records the stage synchronously (before
  // returning its promise), so the race stub knows which stages "hang" (return STEP_TIMED_OUT) vs pass —
  // no fragile microtask timing. This is the exact live failure: `closed` (Athena) + `inbox` (Gmail) hang.
  const hung = new Set(["closed", "inbox"]);
  const cur = { stage: "" };
  const visited: string[] = [];
  const step: StepFn = async (stage, state) => {
    cur.stage = stage;                      // set synchronously — the race stub reads it before awaiting
    visited.push(stage);
    if (hung.has(stage)) return new Promise<StepResult>(() => {}); // never resolves — the genuine hang
    return { counts: state.counts, cursor: state.cursor, more: false };
  };
  const race: StepRace = (p, _ms) => (hung.has(cur.stage) ? Promise.resolve(STEP_TIMED_OUT) : p);
  const rec = recorder();
  const res = await driveDrain(fresh(), boundStep(step, 12_000, race), { budgetMs: Number.POSITIVE_INFINITY, now: () => 0, persist: rec.persist });
  check("F: run reaches done despite two hung stages (no 79% wedge)", res.done && res.state.stage === "done");
  check("F: both hung stages recorded as skipped", [...hung].every((s) => ((res.state.cursor.timed_out_stages as string[]) ?? []).includes(s)));
  check("F: healthy stages still executed", visited.includes("causelist") && visited.includes("summaries") && visited.includes("enrich"));
  check("F: last persist marks done", rec.persisted[rec.persisted.length - 1].done === true);
}

}

main().then(() => {
  console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}).catch((e) => { console.error(e); process.exit(1); });
