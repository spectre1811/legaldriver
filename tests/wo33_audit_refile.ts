// WO-33 W4 — audit-refile + null-contract + match-only guardrails.
// Run: npx tsx tests/wo33_audit_refile.ts
// Covers: (1) the null-contract instruction is in the classify prompt; (2) resolveFiling's
// matchOnly mode LINKS to existing records but NEVER creates one (the unattended-audit safety
// property); (3) decideRefile's structural-confidence rule — strong new match → file, fuzzy → suggest.
import { buildClassifyPrompt } from "../src/lib/docs/classify-core";
import { resolveFiling } from "../src/lib/docs/autofile";
import { decideRefile } from "../src/lib/docs/audit-refile";

let failed = 0;
function ok(name: string, cond: boolean) {
  console.log(`${cond ? "✓" : "✗ FAIL"} ${name}`);
  if (!cond) failed++;
}

// A chainable Supabase-query mock. `clientHit`/`matterHit` are what `maybeSingle()` returns for
// the exact client/matter lookups; list queries (fuzzy candidates) return []. Every `.insert()`
// is recorded so we can assert match-only never writes.
function makeSb(opts: { clientHit?: { id: string } | null; matterHit?: { id: string } | null } = {}) {
  const inserts: unknown[] = [];
  let clientTable = false;
  const from = (table: string) => {
    clientTable = table === "client";
    const b: Record<string, unknown> = {};
    for (const m of ["select", "eq", "ilike", "contains", "or", "order"]) b[m] = () => b;
    b.limit = () => b; // list path is awaited via `then`
    b.insert = (v: unknown) => { inserts.push(v); return b; };
    b.update = () => b;
    b.single = async () => ({ data: { id: `NEW-${inserts.length}` } });
    b.maybeSingle = async () => ({ data: (clientTable ? opts.clientHit : opts.matterHit) ?? null });
    b.then = (resolve: (v: { data: unknown[] }) => unknown) => resolve({ data: [] });
    return b;
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { sb: { from } as any, inserts };
}

const legalWithSignals = {
  doc_type: "notice", category: "other", client_id: null, matter_id: null, confidence: 0.4,
  extracted: { parties: [], dates: [], amounts: [], cnrs: ["CNR-1"] },
  summary: "", is_legal: true, suggested_client_name: "Acme Corp", suggested_matter_title: null,
};

async function main() {
  // 1) NULL-CONTRACT — the prompt tells the model not to infer absent fields.
  const prompt = buildClassifyPrompt({ docTextOrSnippet: "hello", clients: [], matters: [] });
  ok("prompt carries the null-contract", /NULL-CONTRACT/i.test(prompt) && /do not infer/i.test(prompt) && /verbatim/i.test(prompt));

  // 2) MATCH-ONLY never creates: no existing match, but is_legal + suggested name + CNR would
  //    normally insert a client AND a matter. matchOnly must insert NOTHING.
  const m = makeSb({ clientHit: null, matterHit: null });
  const rMatchOnly = await resolveFiling(m.sb, "T1", { ...legalWithSignals }, { matchOnly: true });
  ok("matchOnly inserts nothing", m.inserts.length === 0 && rMatchOnly.clientId === null && rMatchOnly.matterId === null);

  // 2b) …while the SAME input WITHOUT matchOnly does create (proves the guard is what blocks it).
  const c = makeSb({ clientHit: null, matterHit: null });
  const rCreate = await resolveFiling(c.sb, "T1", { ...legalWithSignals });
  ok("non-matchOnly creates the missing client + matter", c.inserts.length === 2 && rCreate.createdClient && rCreate.createdMatter);

  // 2c) MATCH-ONLY still LINKS to an existing record, and flags it STRONG (exact name/CNR).
  const h = makeSb({ clientHit: { id: "C1" }, matterHit: { id: "M1" } });
  const rLink = await resolveFiling(h.sb, "T1", { ...legalWithSignals }, { matchOnly: true });
  ok("matchOnly links existing + marks strong", h.inserts.length === 0 && rLink.clientId === "C1" && rLink.clientStrong && rLink.matterId === "M1" && rLink.matterStrong);

  // 3) decideRefile — structural confidence:
  const none = decideRefile({ clientId: "C1", matterId: null }, { clientId: "C1", matterId: null, clientStrong: true, matterStrong: false });
  ok("no new binding → none", none.kind === "none");

  const fileC = decideRefile({ clientId: null, matterId: null }, { clientId: "C9", matterId: null, clientStrong: true, matterStrong: false });
  ok("new STRONG client → file", fileC.kind === "file" && fileC.clientId === "C9");

  const fileM = decideRefile({ clientId: null, matterId: null }, { clientId: null, matterId: "M9", clientStrong: false, matterStrong: true });
  ok("new STRONG matter → file", fileM.kind === "file" && fileM.matterId === "M9");

  const suggest = decideRefile({ clientId: null, matterId: null }, { clientId: "C7", matterId: null, clientStrong: false, matterStrong: false });
  ok("new FUZZY client → suggest (never silent file)", suggest.kind === "suggest" && suggest.clientId === "C7");
}

main().then(() => {
  console.log(failed === 0 ? "\nPASS" : `\nFAIL (${failed})`);
  process.exit(failed === 0 ? 0 : 1);
});
