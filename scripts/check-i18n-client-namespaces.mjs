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
// ANY non-literal argument to useTranslations() (variable, expression,
// template literal) causes a hard failure — all 162 current call sites use
// string literals, so there is zero cost today, and failing closed prevents
// a one-token refactor from silently defeating the guard.
//
// Usage: node scripts/check-i18n-client-namespaces.mjs

import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import NAMES from "../src/lib/CLIENT_NAMESPACE_PATHS.json" with { type: "json" };

const WHITELIST = new Set(NAMES);

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

// Any useTranslations( call whose first argument is NOT a quoted string
// literal (single or double) — including template literals, variables,
// expressions — is non-literal and cannot be statically checked.
const NON_LITERAL_RE = /useTranslations\(\s*(?![)"'])/g;

const files = walkFiles("src", [".tsx", ".ts"]);

const violations = new Map();
const nonLiteral = [];

for (const file of files) {
  let src;
  try {
    src = readFileSync(file, "utf8");
  } catch {
    continue;
  }

  // Skip the whitelist definition files themselves
  if (file.includes("i18n-client-subset") || file.includes("CLIENT_NAMESPACE_PATHS")) continue;

  // Static string namespaces
  for (const match of src.matchAll(STATIC_NS_RE)) {
    const ns = match[1];
    if (!isCovered(ns)) {
      const key = `${ns} (in ${file})`;
      if (!violations.has(key)) violations.set(key, file);
    }
  }

  // Non-literal argument — hard fail
  if (NON_LITERAL_RE.test(src)) {
    nonLiteral.push(file);
  }
}

let exitCode = 0;

if (violations.size) {
  console.error(
    "NAMESPACES NOT COVERED BY WHITELIST — add them to " +
      "src/lib/CLIENT_NAMESPACE_PATHS.json, or if the caller is server-only, " +
      "switch it to getTranslations() so the namespace never crosses the RSC boundary:"
  );
  for (const [key] of violations) console.error(`  ${key}`);
  console.error(
    `\n${violations.size} unique namespace(s) not covered by whitelist. ` +
      "These namespaces will NOT be shipped to the client provider, so any " +
      "useTranslations() call for them will render raw key strings to users.\n"
  );
  exitCode = 1;
}

if (nonLiteral.length) {
  console.error(
    "NON-LITERAL useTranslations() ARGUMENTS — these cannot be checked " +
      "statically and defeat the namespace guard.  Switch to a string literal " +
      "or, if truly necessary, add an explicit allow-list entry:"
  );
  for (const f of nonLiteral) console.error(`  ${f}`);
  console.error(
    `\n${nonLiteral.length} file(s) with non-literal useTranslations() arguments. ` +
      "Failing closed — all 162 current call sites use string literals.\n"
  );
  exitCode = 1;
}

if (exitCode === 0) {
  console.log(
    `WO-365 i18n namespace guard: ${files.length} files scanned, ` +
      `${WHITELIST.size} namespaces whitelisted, all static namespaces covered.`
  );
}

process.exit(exitCode);
