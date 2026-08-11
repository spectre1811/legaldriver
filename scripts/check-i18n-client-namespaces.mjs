// WO-365 W1 · i18n client-namespace guard.
// Scans every .tsx / .ts file in src/ for useTranslations("ns") calls,
// checks every static namespace string against the committed whitelist, and
// fails the build (exit 1) when a client component references a namespace
// that is NOT shipped to the provider — preventing silent raw-key rendering.
//
// A namespace is covered if it OR any dot-separated prefix is whitelisted.
// E.g. "cases.attention" is covered by "cases"; "dashboard.onboarding.lead"
// is covered by "dashboard.onboarding".
//
// Dynamic-key calls (template literals, variables) are listed as warnings
// but do NOT fail — they cannot be checked statically and MUST be reviewed
// manually when the whitelist changes.
//
// Usage: node scripts/check-i18n-client-namespaces.mjs
//
// Keep this whitelist synchronised with src/lib/i18n-client-subset.ts.

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const WHITELIST = new Set([
  "assistant",
  "auth",
  "calendar",
  "caseDetail",
  "casePreview",
  "cases",
  "causeList",
  "clients",
  "combobox",
  "common",
  "comms",
  "copilot",
  "dashboard.clients",
  "dashboard.inbox",
  "dashboard.onboarding",
  "documents",
  "draft",
  "enum",
  "inbox",
  "invoices",
  "ip",
  "landing",
  "messages",
  "nav",
  "notices",
  "pagination",
  "portal",
  "requestAccess",
  "research",
  "search",
  "settings",
  "shell",
  "voice",
]);

function isCovered(ns) {
  if (WHITELIST.has(ns)) return true;
  const parts = ns.split(".");
  for (let i = parts.length - 1; i >= 1; i--) {
    if (WHITELIST.has(parts.slice(0, i).join("."))) return true;
  }
  return false;
}

function walkFiles(dir, exts) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".next") continue;
      files.push(...walkFiles(full, exts));
    } else if (exts.some((e) => entry.name.endsWith(e))) {
      files.push(full);
    }
  }
  return files;
}

const STATIC_NS_RE = /useTranslations\(\s*["']([^"']+)["']\s*\)/g;
const DYNAMIC_NS_RE = /useTranslations\(\s*`/g;

const files = walkFiles("src", [".tsx", ".ts"]);

const violations = new Map();
const dynamicWarnings = [];

for (const file of files) {
  let src;
  try {
    src = readFileSync(file, "utf8");
  } catch {
    continue;
  }

  // Static string namespaces
  for (const match of src.matchAll(STATIC_NS_RE)) {
    const ns = match[1];
    // Skip the whitelist file's own documentation example
    if (file.includes("i18n-client-subset")) continue;
    if (!isCovered(ns)) {
      const key = `${ns} (in ${file})`;
      if (!violations.has(key)) violations.set(key, file);
    }
  }

  // Dynamic (template literal) — warn, don't fail
  if (DYNAMIC_NS_RE.test(src)) {
    dynamicWarnings.push(file);
  }
}

let exitCode = 0;

if (violations.size) {
  console.error(
    "NAMESPACES NOT COVERED BY WHITELIST — add them to src/lib/i18n-client-subset.ts:"
  );
  for (const [key] of violations) console.error(`  ${key}`);
  console.error(
    `\n${violations.size} unique namespace(s) not covered by whitelist. ` +
      "These namespaces will NOT be shipped to the client provider, so any " +
      "useTranslations() call for them will render raw key strings to users.\n"
  );
  exitCode = 1;
}

if (dynamicWarnings.length) {
  console.warn(
    `::warning title=WO-365 dynamic namespace::` +
      `${dynamicWarnings.length} file(s) use a template literal as a useTranslations() ` +
      `argument — these cannot be checked statically: ${dynamicWarnings.join(", ")}`
  );
}

if (exitCode === 0) {
  console.log(
    `WO-365 i18n namespace guard: ${files.length} files scanned, ` +
      `${WHITELIST.size} namespaces whitelisted, all static namespaces covered.`
  );
}

process.exit(exitCode);
