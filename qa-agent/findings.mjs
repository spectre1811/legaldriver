// WO-36 Layer 2 (agentic QA) · PURE finding logic — no browser, no network, no LLM, so it is fully
// unit-testable (findings.test.mjs). The runner (run.mjs) does the browser + LLM I/O and delegates
// every decision (dedup, gating, rollup) to these functions. Keeping the judgment pure is what makes
// a non-deterministic agent's OUTPUT deterministically handled.

import { createHash } from "node:crypto";

export const SEVERITIES = ["blocker", "high", "medium", "low", "nit"];
export const FINDING_TYPES = ["bug", "ux", "a11y", "copy"];

// Severity rank: lower index = worse. Used for sorting + the issue-filing gate.
export function severityRank(sev) {
  const i = SEVERITIES.indexOf(sev);
  return i === -1 ? SEVERITIES.length : i;
}

// A finding worth a GitHub issue = blocker/high (real bugs a human must act on). ux/copy/low/nit feed
// the rolling "UI polish" report the design-engineer reviews — NOT the issue tracker (avoids noise).
export function shouldFileIssue(finding) {
  return finding.severity === "blocker" || finding.severity === "high";
}

// Stable identity for a finding across nightly runs, so a recurring issue is COMMENTED ("still
// present") rather than refiled. Keyed on route + type + a normalized summary (lowercased, collapsed
// whitespace, stripped trailing punctuation) so trivial wording drift doesn't spawn a duplicate.
export function normalizeSummary(s) {
  // trim BEFORE stripping trailing punctuation — else a trailing space leaves the punctuation
  // no longer at end-of-string and it survives (regressed once; covered by findings.test.mjs).
  return String(s || "").toLowerCase().replace(/\s+/g, " ").trim().replace(/[.!?,;:]+$/g, "").trim();
}

export function findingHash(finding) {
  const key = `${finding.route}::${finding.type}::${normalizeSummary(finding.summary)}`;
  return createHash("sha256").update(key).digest("hex").slice(0, 12);
}

// Split fresh findings against the set of hashes already tracked (from open QA issues). Fresh → file;
// already-seen → comment "still present". Also de-dupes within THIS run (two agents flagging the same
// thing → one).
export function dedupeAgainstExisting(findings, existingHashes = new Set()) {
  const seen = new Set();
  const toFile = [];
  const toComment = [];
  for (const f of findings) {
    const h = findingHash(f);
    if (seen.has(h)) continue;
    seen.add(h);
    (existingHashes.has(h) ? toComment : toFile).push({ ...f, hash: h });
  }
  return { toFile, toComment };
}

// Roll a set of per-route reports into one markdown digest (qa-reports/latest.md). Summary table
// first (scan-able), then findings grouped worst-first. uxScore is the rubric score (1-5, 5 = best).
export function rollupMarkdown(routeReports, meta = {}) {
  const all = routeReports.flatMap((r) => (r.findings || []).map((f) => ({ ...f, route: f.route ?? r.route })));
  const byId = (id) => all.filter((f) => f.severity === id).length;
  const stampedAt = meta.at || "(unstamped)";
  const scored = routeReports.filter((r) => typeof r.uxScore === "number");
  const avg = scored.length ? (scored.reduce((s, r) => s + r.uxScore, 0) / scored.length).toFixed(1) : "—";

  const lines = [];
  lines.push(`# QA sweep — ${stampedAt}`);
  lines.push("");
  lines.push(
    `**${routeReports.length} routes** · avg UX ${avg}/5 · findings: ` +
      SEVERITIES.map((s) => `${byId(s)} ${s}`).join(" · "),
  );
  lines.push("");
  lines.push("## Routes");
  lines.push("| Route | UX | blocker | high | medium | low | nit |");
  lines.push("|---|---|---|---|---|---|---|");
  for (const r of [...routeReports].sort((a, b) => (a.uxScore ?? 9) - (b.uxScore ?? 9))) {
    const c = (sev) => (r.findings || []).filter((f) => f.severity === sev).length;
    lines.push(
      `| ${r.route} | ${r.uxScore ?? "—"} | ${c("blocker")} | ${c("high")} | ${c("medium")} | ${c("low")} | ${c("nit")} |`,
    );
  }
  lines.push("");
  lines.push("## Findings (worst first)");
  const sorted = [...all].sort((a, b) => severityRank(a.severity) - severityRank(b.severity));
  if (!sorted.length) lines.push("_No findings._");
  for (const f of sorted) {
    lines.push(`### [${f.severity}/${f.type}] ${f.route} — ${f.summary}`);
    if (f.repro?.length) lines.push(f.repro.map((s) => `  ${s}`).join("\n"));
    if (f.evidence) lines.push(`  evidence: ${f.evidence}`);
    lines.push("");
  }
  return lines.join("\n");
}
