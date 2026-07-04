// WO-36 Layer 2 · Agentic exploratory QA sweep. Walks every route like a human, judges each screen
// against the polish rubric via Claude (from its accessibility tree — ~10x cheaper than per-step
// screenshots), and writes a structured report. blocker/high findings can auto-file GitHub issues
// (deduped across runs). ADVISORY only — never a merge gate (LLM explorers over-click/hallucinate).
//
// Run:  node qa-agent/run.mjs [--file-issues] [--routes=/dashboard,/dashboard/cases]
// Needs: a live DEMO_MODE=1 app (E2E_BASE_URL, default http://localhost:3000), ANTHROPIC_API_KEY,
//        and demo creds (E2E_EMAIL/E2E_PASSWORD) for /dashboard routes. --file-issues needs
//        GITHUB_TOKEN + GITHUB_REPOSITORY. Nothing here runs in the product; it's a dev/QA tool.

import { chromium } from "playwright";
import Anthropic from "@anthropic-ai/sdk";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { SYSTEM_PROMPT, FINDINGS_SCHEMA, buildUserMessage } from "./rubric.mjs";
import { rollupMarkdown, dedupeAgainstExisting, shouldFileIssue, findingHash } from "./findings.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE_URL = process.env.E2E_BASE_URL || "http://localhost:3000";
const MODEL = process.env.QA_MODEL || "claude-haiku-4-5-20251001"; // cheap by design — full-app sweep
const MAX_ROUTES = Number(process.env.QA_MAX_ROUTES || 0) || Infinity; // cost cap
const args = process.argv.slice(2);
const FILE_ISSUES = args.includes("--file-issues");
const routeFilter = (args.find((a) => a.startsWith("--routes=")) || "").replace("--routes=", "").split(",").filter(Boolean);

function die(msg) {
  console.error(`qa-agent: ${msg}`);
  process.exit(1);
}

async function loginState(browser) {
  const email = process.env.E2E_EMAIL || process.env.DEMO_EMAIL;
  const password = process.env.E2E_PASSWORD || process.env.DEMO_PASSWORD;
  if (!email || !password) return null; // → dashboard routes skipped
  const ctx = await browser.newContext({ baseURL: BASE_URL });
  const page = await ctx.newPage();
  await page.goto("/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  const ok = await page.waitForURL(/\/dashboard(\/|$)/, { timeout: 20_000 }).then(() => true).catch(() => false);
  if (!ok) console.error("qa-agent: WARNING — login did not reach /dashboard; dashboard routes may be judged as the login screen. Check E2E_EMAIL/E2E_PASSWORD + DEMO env.");
  const state = await ctx.storageState();
  await ctx.close();
  return state;
}

async function judge(anthropic, route, snapshot) {
  const res = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1600,
    system: SYSTEM_PROMPT,
    tools: [{ name: "report", description: "Report UX/a11y/bug/copy findings for the screen.", input_schema: FINDINGS_SCHEMA }],
    tool_choice: { type: "tool", name: "report" },
    messages: [{ role: "user", content: buildUserMessage(route, snapshot) }],
  });
  const tool = res.content.find((c) => c.type === "tool_use");
  const out = tool?.input ?? { uxScore: null, findings: [] };
  return { uxScore: out.uxScore ?? null, findings: (out.findings ?? []).map((f) => ({ ...f, route })) };
}

async function fileIssues(reports) {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPOSITORY; // "owner/name"
  if (!token || !repo) return die("--file-issues needs GITHUB_TOKEN + GITHUB_REPOSITORY");
  // Returns { ok, data }; a failed write is surfaced (never silently counted as success).
  const api = async (p, init) => {
    const r = await fetch(`https://api.github.com/repos/${repo}${p}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", ...(init?.headers || {}) },
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) console.error(`qa-agent: GitHub ${init?.method || "GET"} ${p} → ${r.status} ${data.message || ""}`);
    return { ok: r.ok, data };
  };

  // Existing open QA issues carry their finding-hash in a hidden marker; build the seen-set from them.
  const { data: open } = await api(`/issues?state=open&labels=qa-agent&per_page=100`);
  const marker = (body) => (String(body || "").match(/<!--qa:([0-9a-f]{12})-->/) || [])[1];
  const existing = new Map((Array.isArray(open) ? open : []).map((i) => [marker(i.body), i.number]).filter(([h]) => h));

  const all = reports.flatMap((r) => r.findings).filter(shouldFileIssue);
  const { toFile, toComment } = dedupeAgainstExisting(all, new Set(existing.keys()));
  let filed = 0;
  let commented = 0;
  for (const f of toFile) {
    const { ok } = await api(`/issues`, {
      method: "POST",
      body: JSON.stringify({
        title: `[QA] ${f.route} — ${f.summary}`.slice(0, 120),
        labels: ["qa-agent", `severity:${f.severity}`, `area:${f.route.split("/")[2] || "public"}`],
        body: `<!--qa:${f.hash}-->\n**Route:** \`${f.route}\` · **${f.severity}/${f.type}**\n\n${f.summary}\n\n${(f.repro || []).join("\n")}\n\n_evidence:_ ${f.evidence || "—"}\n\n_Filed by the WO-36 QA agent (advisory). Confirm before acting._`,
      }),
    });
    if (ok) filed++;
  }
  for (const f of toComment) {
    const num = existing.get(f.hash);
    if (num) {
      const { ok } = await api(`/issues/${num}/comments`, { method: "POST", body: JSON.stringify({ body: `Still present as of the latest QA sweep (route \`${f.route}\`).` }) });
      if (ok) commented++;
    }
  }
  console.log(`qa-agent: filed ${filed}/${toFile.length} new issue(s), commented ${commented}/${toComment.length} recurring.`);
}

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) die("set ANTHROPIC_API_KEY (the sweep judges screens via Claude)");
  const inv = JSON.parse(readFileSync(join(root, "e2e/routes.generated.json"), "utf8"));
  let routes = inv.routes.filter((r) => !r.dynamic).map((r) => r.url); // MVP: static routes
  if (routeFilter.length) routes = routes.filter((r) => routeFilter.includes(r));
  routes = routes.slice(0, MAX_ROUTES);

  const anthropic = new Anthropic({ apiKey });
  const browser = await chromium.launch();
  const state = await loginState(browser);
  const authed = state ? await browser.newContext({ baseURL: BASE_URL, storageState: state }) : null;
  const anon = await browser.newContext({ baseURL: BASE_URL });

  const reports = [];
  for (const route of routes) {
    const needsAuth = route === "/dashboard" || route.startsWith("/dashboard/");
    if (needsAuth && !authed) {
      console.log(`- skip ${route} (no demo creds)`);
      continue;
    }
    const page = await (needsAuth ? authed : anon).newPage();
    try {
      await page.goto(route, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => {});
      const snapshot = await page.accessibility.snapshot();
      const report = await judge(anthropic, route, snapshot);
      reports.push({ route, ...report });
      const worst = report.findings.filter(shouldFileIssue).length;
      console.log(`- ${route}: uxScore ${report.uxScore ?? "—"}, ${report.findings.length} finding(s)${worst ? ` (${worst} blocker/high)` : ""}`);
    } catch (e) {
      reports.push({ route, uxScore: null, findings: [{ route, severity: "high", type: "bug", summary: `sweep failed to load: ${e.message}` }] });
      console.log(`- ${route}: ERROR ${e.message}`);
    } finally {
      await page.close();
    }
  }
  await browser.close();

  mkdirSync(join(root, "qa-reports"), { recursive: true });
  const stamp = process.env.QA_STAMP || new Date().toISOString(); // caller may pin for determinism
  writeFileSync(join(root, "qa-reports/latest.md"), rollupMarkdown(reports, { at: stamp }));
  writeFileSync(join(root, "qa-reports/latest.json"), JSON.stringify({ at: stamp, reports }, null, 2));
  console.log(`qa-agent: wrote qa-reports/latest.{md,json} (${reports.length} routes).`);

  if (FILE_ISSUES) await fileIssues(reports);
}

main().catch((e) => die(e.stack || e.message));
