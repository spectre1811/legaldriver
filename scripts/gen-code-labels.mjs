#!/usr/bin/env node
// WO-32 / BP-05 W2 · Generate src/lib/court/code-labels.data.ts.
//
// SOURCE (BP-05, founder decision 2026-07-05): the canonical case-type vocabulary is now OWNED
// and SERVED by the platform at GET /v1/dictionaries (ecourts-scraper). This generator pulls the
// caseType master from the contract so the app resolves against the platform's single source of
// truth — no per-app derivation, no drift. It falls back to the committed corpus CSV
// (code-labels.source.csv) when the platform is unreachable (offline builds), so this never breaks
// a build. The output shape is unchanged, so the synchronous runtime helper (code-labels.ts) and
// every call-site stay exactly as-is.
//
// The corpus self-labels its own case-type expansions (mined into the master, never guessed):
//   HIGH:     "CODE(FULL NAME)-NN"   e.g.  CR.A(CRIMINAL APPEAL)-43
//   DISTRICT: "CODE - Full Name"     e.g.  CC - CRIMINAL CASE
// Bare codes with no labeled sibling stay raw (UNRESOLVED_CASE_TYPES → exec/DATA-GAPS.md).
//
// Run (contract, default): LD_API_BASE=http://13.202.148.71:8080 LD_API_KEY=… node scripts/gen-code-labels.mjs
// Run (force CSV):         node scripts/gen-code-labels.mjs --source=csv
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const SRC = join(root, "src/lib/court/code-labels.source.csv");
const OUT = join(root, "src/lib/court/code-labels.data.ts");
const forceCsv = process.argv.includes("--source=csv");

// Normalize a case-type code so punctuation/spacing variants collapse:
//   "CRMA-S" / "CRMA S" -> "CRMA S";  "CR.MA" -> "CR MA";  "CMA-DC" -> "CMA DC".
const normCode = (c) => c.toUpperCase().replace(/[.\-\s]+/g, " ").trim();

// ── source: platform contract (BP-05 /v1/dictionaries) ──────────────────────
// Returns { master:{HIGH,DISTRICT,ANY}, unresolved:[{tier,code,n}], provenance } or null on failure.
async function loadFromContract() {
  const base = process.env.LD_API_BASE, key = process.env.LD_API_KEY;
  if (!base || !key) return null;
  try {
    const res = await fetch(`${base.replace(/\/$/, "")}/v1/dictionaries?dims=caseType`, {
      headers: { "X-API-Key": key }, signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await res.json();
    const ct = body?.dimensions?.caseType;
    if (!ct?.master) throw new Error("no caseType.master in contract response");
    // contract master values are CodeLabels {full,code,known}; take the display-ready `full`.
    const pick = (tierObj) => Object.fromEntries(
      Object.entries(tierObj || {}).map(([k, v]) => [k, typeof v === "string" ? v : v.full]));
    return {
      master: { HIGH: pick(ct.master.HIGH), DISTRICT: pick(ct.master.DISTRICT), ANY: pick(ct.master.ANY) },
      unresolved: (ct.unresolved || []).map((u) => ({ tier: u.tier, code: u.code, n: u.n })),
      provenance: `the platform /v1/dictionaries contract (generated_at ${body.generated_at})`,
    };
  } catch (e) {
    console.warn(`[gen-code-labels] contract fetch failed (${e.message}); falling back to CSV`);
    return null;
  }
}

// ── source: committed corpus CSV (offline fallback, unchanged WO-32 logic) ──
function loadFromCsv() {
  const parseLabeled = (raw) => {
    const dc = raw.match(/^(.+?)\s-\s(.+)$/);            // CODE - Full (district; tried first)
    if (dc) return [dc[1].trim(), dc[2].trim()];
    const hc = raw.match(/^([^()]+?)\((.+)\)(?:-\d+)?$/); // CODE(FULL)-NN (HC; code has no parens)
    if (hc) return [hc[1].trim(), hc[2].trim()];
    return null;
  };
  const rows = readFileSync(SRC, "utf8").split("\n")
    .filter((l) => l && !l.startsWith("#") && !l.startsWith("tier,"))
    .map((l) => { const i = l.indexOf(","), j = l.lastIndexOf(","); return { tier: l.slice(0, i), raw: l.slice(i + 1, j), n: Number(l.slice(j + 1)) || 0 }; })
    .filter((r) => r.raw);
  const master = { HIGH: {}, DISTRICT: {} };
  const bare = { HIGH: new Map(), DISTRICT: new Map() };
  for (const { tier, raw, n } of rows) {
    const t = tier === "HIGH" ? "HIGH" : "DISTRICT";
    const parsed = parseLabeled(raw);
    if (parsed) { const key = normCode(parsed[0]); const prev = master[t][key]; if (!prev || n > prev.n) master[t][key] = { full: parsed[1], n }; }
    else { const key = normCode(raw); const prev = bare[t].get(key); if (!prev || n > prev.n) bare[t].set(key, { raw, n }); }
  }
  const anyMaster = {};
  for (const t of ["HIGH", "DISTRICT"]) for (const [key, v] of Object.entries(master[t])) if (!anyMaster[key] || v.n > anyMaster[key].n) anyMaster[key] = v;
  const unresolved = [];
  for (const t of ["HIGH", "DISTRICT"]) for (const [key, { raw, n }] of bare[t]) if (!master[t][key] && !anyMaster[key]) unresolved.push({ tier: t, code: raw, n });
  unresolved.sort((a, b) => b.n - a.n);
  const flatten = (m) => Object.fromEntries(Object.entries(m).map(([k, v]) => [k, v.full]));
  return { master: { HIGH: flatten(master.HIGH), DISTRICT: flatten(master.DISTRICT), ANY: flatten(anyMaster) },
    unresolved, provenance: "the committed corpus CSV (code-labels.source.csv)" };
}

// ── emit ─────────────────────────────────────────────────────────────────────
const emit = (m) => "{ " + Object.keys(m).sort().map((k) => `${JSON.stringify(k)}: ${JSON.stringify(m[k])}`).join(", ") + " }";

const data = (!forceCsv && await loadFromContract()) || loadFromCsv();
const { master, unresolved, provenance } = data;
const resolvedCount = new Set([...Object.keys(master.HIGH), ...Object.keys(master.DISTRICT)]).size;

const out = `// GENERATED by scripts/gen-code-labels.mjs — DO NOT EDIT BY HAND.
// Source of truth: ${provenance}. The eCourts corpus self-labels its own case-type
// expansions; ${resolvedCount} codes resolved; ${unresolved.length} bare codes had no labeled
// sibling and stay raw (see UNRESOLVED_CASE_TYPES + exec/DATA-GAPS.md). Never hand-guessed.

export const CASE_TYPE_MASTER: Record<string, Record<string, string>> = {
  HIGH: ${emit(master.HIGH)},
  DISTRICT: ${emit(master.DISTRICT)},
  ANY: ${emit(master.ANY)},
};

// Bare codes seen in the corpus with NO sourced expansion — shown raw + flagged, never guessed.
export const UNRESOLVED_CASE_TYPES: { tier: string; code: string; n: number }[] = [
${unresolved.map((u) => `  { tier: ${JSON.stringify(u.tier)}, code: ${JSON.stringify(u.code)}, n: ${u.n} },`).join("\n")}
];
`;

writeFileSync(OUT, out);
console.log(`✓ ${OUT}`);
console.log(`  source: ${provenance}`);
console.log(`  resolved codes: ${resolvedCount}  ·  unresolved (stay raw): ${unresolved.length}`);
console.log(`  top unresolved: ${unresolved.slice(0, 12).map((u) => `${u.code}(${u.n})`).join(", ")}`);
