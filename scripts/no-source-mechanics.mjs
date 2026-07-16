#!/usr/bin/env node
// WO-132 W2 · CI guard — no data-source mechanics on user-visible surfaces (legaldriver).
//
// Founder directive (2026-07-13): the product speaks only of "live/updated" court data with real
// freshness stamps (`last_synced_at`) — never of its pipeline. No "eCourts", "NIC", "NJDG",
// "scrape/crawl", or fetch-from-source phrasing may appear in anything a user reads: the i18n
// message catalogs (src/i18n/messages/*.json) and the copy-bearing components/pages listed below.
// This guard fails the build if a denylisted term reappears there.
//
// Ported from peshi-search's scripts/no-source-mechanics.mjs (WO-132 W1). Two legaldriver deltas:
//   • catalogs live at src/i18n/messages (not messages/);
//   • the denylist also carries the Devanagari transliterations (स्क्रैप = scrape, क्रॉल = crawl)
//     because the Hindi catalog spells the mechanics out in Devanagari, which the Latin \bscrap\w*
//     rule can't see.
//
// It scans SOURCE (not the built bundle): the catalogs ARE the user-string bundle next-intl serves,
// and the COPY_FILES emit their literal default English text verbatim. Internal surfaces are out of
// scope by design: code comments, identifiers (e.g. the `ecourtsindia` provider id, imports from
// lib/court/*), lib/api/ops files, and repo docs still document the mechanics (agents need that) —
// the directive is only about what USERS see. So for source files we strip comments + import lines
// before matching, and we only scan the explicitly copy-bearing files in COPY_FILES.
//
// Founder-approved exceptions (e.g. the HITL capture step, which must name the official portal URL
// services.ecourts.gov.in so the advocate knows where to go — founder decision 2026-07-14) go in
// scripts/source-mechanics-allowlist.json so that outcome never has to fight this guard.
//
// WO-181 (2026-07-15) extends this same denylist machinery to a second banned-copy category: the
// retired "operating system for Indian law/lawyers" tagline (a competitor/TM collision) — kept here
// rather than in a parallel guard so there is ONE user-copy gate, already wired into the CI build.
//
// Run: node scripts/no-source-mechanics.mjs   (wired into CI as `npm run guard:copy`)
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

// Denylisted data-source mechanics. Case-insensitive; word-boundaried where a bare acronym would
// otherwise trip on innocent substrings (NIC in "clinic", etc.) or a provider id (`ecourtsindia`,
// `legaldriver`) that is not the literal source name. Devanagari terms carry no \b (word boundaries
// are ASCII-only) — a bare substring is exact enough for स्क्रैप / क्रॉल.
const DENYLIST = [
  { re: /\becourts\b/i, term: "eCourts" },
  { re: /\bnjdg\b/i, term: "NJDG" },
  { re: /\bnic\b/i, term: "NIC" },
  { re: /\bscrap\w*/i, term: "scrape/scraper/scraping" },
  { re: /\bcrawl\w*/i, term: "crawl" },
  { re: /स्क्रैप/, term: "scrape (स्क्रैप)" },
  { re: /क्रॉल/, term: "crawl (क्रॉल)" },
  // WO-181 · retired brand tagline — "the operating system for India('s)/Indian law(yers)".
  // A competitor/TM collision (ecourtsindia.com hero = "The Operating System for Indian Law");
  // purged 2026-07-15, replaced by "India's courts, made intelligent." Curly-or-straight ’/'.
  // Devanagari carries the transliteration the Latin rule can't see (as with स्क्रैप/क्रॉल).
  { re: /operating\s+system\s+for\s+india(?:n|['’]s)?\s+(?:law|lawyers)\b/i, term: "retired tagline (operating system for Indian law/lawyers)" },
  { re: /ऑपरेटिंग\s*सिस्टम/, term: "retired tagline (ऑपरेटिंग सिस्टम)" },
  // WO-202 W2 (2026-07-16) · retired marketing lines from copy-deck v1 ("Your entire practice.
  // One daily driver."). Purged in favour of hero-A / verb-system voice; locked so they can't
  // reappear. "पूरी प्रैक्टिस" is NOT listed — it is innocent Hindi for "whole practice" in live
  // copy; only the coined "डेली ड्राइवर" mark is banned in Devanagari.
  { re: /\bdaily\s+driver\b/i, term: "retired line (daily driver)" },
  { re: /\byour\s+entire\s+practice\b/i, term: "retired line (your entire practice)" },
  { re: /डेली\s*ड्राइवर/, term: "retired line (डेली ड्राइवर)" },
];

// Copy-bearing components/pages that emit literal user-visible default text (the catalogs cover the
// t()-driven strings; these carry English fallbacks or interpolated source labels in code). Per-route
// generateMetadata pulls from the catalogs, so only files that hardcode display copy are listed.
const COPY_FILES = [
  "src/components/court/staleness-banner.tsx",   // English fallback banner copy
  "src/components/court/empty-cell.tsx",         // English fallback "no value" copy
  "src/app/dashboard/cases/cnr/[cnr]/page.tsx",  // interpolated source-line fallback
  "src/app/dashboard/cases/[id]/page.tsx",       // interpolated source-line fallback
  "src/lib/brand.ts",                            // WO-181 · the tagline's canonical home
];

// WO-131 W2 email templates: guard their directory too, for when they land.
const TEMPLATE_DIRS = ["emails", "src/emails"];

const allowlistPath = join(root, "scripts/source-mechanics-allowlist.json");
const allow = existsSync(allowlistPath)
  ? (JSON.parse(readFileSync(allowlistPath, "utf8")).allow ?? [])
  : [];
const isAllowed = (text) => allow.some((a) => a && text.includes(a));

const violations = [];
const record = (file, where, text) => {
  if (isAllowed(text)) return;
  for (const { re, term } of DENYLIST) {
    if (re.test(text)) violations.push({ file, where, term, text: text.trim() });
  }
};

// Recursively list files under a dir (relative to root), matching an optional extension set.
const listFiles = (absDir, exts) => {
  const out = [];
  for (const ent of readdirSync(absDir, { withFileTypes: true })) {
    const abs = join(absDir, ent.name);
    if (ent.isDirectory()) out.push(...listFiles(abs, exts));
    else if (!exts || exts.some((e) => ent.name.endsWith(e))) out.push(abs);
  }
  return out;
};

// 1) Message catalogs — parse and walk every string VALUE (keys are not user-visible).
const messagesDir = join(root, "src/i18n/messages");
const catalogs = existsSync(messagesDir)
  ? listFiles(messagesDir, [".json"])
  : [];

const walk = (node, path, file) => {
  if (typeof node === "string") record(file, path, node);
  else if (node && typeof node === "object")
    for (const [k, v] of Object.entries(node)) walk(v, path ? `${path}.${k}` : k, file);
};
for (const cat of catalogs) {
  walk(JSON.parse(readFileSync(cat, "utf8")), "", relative(root, cat));
}

// 2) Copy-bearing source files — strip comments + import lines, then scan the remaining literals.
const stripForScan = (src) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, "") // block comments
    .split("\n")
    .filter((l) => !/^\s*(import|export\s+\*|\/\/)/.test(l)) // import & full-line comments
    .map((l) => l.replace(/\/\/.*$/, "")) // trailing line comments
    .join("\n");

const scanFile = (rel) => {
  const abs = join(root, rel);
  if (!existsSync(abs)) return;
  stripForScan(readFileSync(abs, "utf8"))
    .split("\n")
    .forEach((line, i) => line.trim() && record(rel, `line ${i + 1}`, line));
};
for (const f of COPY_FILES) scanFile(f);
for (const dir of TEMPLATE_DIRS) {
  const abs = join(root, dir);
  if (existsSync(abs))
    for (const f of listFiles(abs, [".tsx", ".ts", ".html", ".mjs", ".js"])) scanFile(relative(root, f));
}

// Report.
if (violations.length) {
  console.error(`\n✗ no-source-mechanics: ${violations.length} data-source-mechanics reference(s) on user surfaces:\n`);
  for (const v of violations) {
    console.error(`  ${v.file} · ${v.where} · [${v.term}]`);
    console.error(`    ${v.text}`);
  }
  console.error(
    `\nUsers should read freshness ("Updated 2h ago", "Refresh now", "Not yet on record"), never the pipeline.`
  );
  console.error(
    `If this is founder-approved copy (e.g. the HITL capture portal URL), add the exact string`
  );
  console.error(`to scripts/source-mechanics-allowlist.json → "allow".\n`);
  process.exit(1);
}
console.log(`✓ no-source-mechanics: ${catalogs.length} catalog(s) + ${COPY_FILES.length} copy file(s) clean.`);
