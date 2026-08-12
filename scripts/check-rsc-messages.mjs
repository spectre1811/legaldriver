// WO-365 W1 · RSC message-payload size gate.
// Loads both locale catalogs, applies selectClientMessages, and measures the
// serialized JSON size of the subset that crosses the RSC boundary.  Exits
// non-zero if the compact payload exceeds the committed baseline + warn_pct %.
//
// This runs in CI after build and is an ASSERTION, not advisory — a payload
// that silently balloons defeats the purpose of the diet.
//
// Usage: node scripts/check-rsc-messages.mjs

import { readFileSync } from "node:fs";
import PATHS from "../src/lib/CLIENT_NAMESPACE_PATHS.json" with { type: "json" };

const BUDGET_FILE = "rsc-messages-budget.json";
const EN_PATH = "src/i18n/messages/en.json";
const HI_PATH = "src/i18n/messages/hi.json";
const DEFAULT_WARN_PCT = 5;

function selectClientMessages(messages) {
  const result = {};
  for (const path of PATHS) {
    const parts = path.split(".");
    let src = messages;
    let dst = result;

    let i = 0;
    for (; i < parts.length - 1; i++) {
      if (!src || !(parts[i] in src)) break;
      if (!(parts[i] in dst)) dst[parts[i]] = {};
      src = src[parts[i]];
      dst = dst[parts[i]];
    }
    if (i !== parts.length - 1) continue;

    const last = parts[parts.length - 1];
    if (src && last in src) dst[last] = src[last];
  }
  return result;
}

// --- budget -----------------------------------------------------------

let budget;
try {
  budget = JSON.parse(readFileSync(BUDGET_FILE, "utf8"));
} catch {
  console.log(
    `::warning title=WO-365 missing budget file::${BUDGET_FILE} not found.`
  );
  process.exit(0);
}

const warnPct =
  typeof budget.warn_pct === "number"
    ? budget.warn_pct
    : DEFAULT_WARN_PCT;
const label = (n) =>
  `${(n / 1024).toFixed(1)} KiB (${n.toLocaleString()} bytes)`;

const LOCALES = [
  { key: "en", path: EN_PATH, baselineKey: "en_client_message_bytes" },
  { key: "hi", path: HI_PATH, baselineKey: "hi_client_message_bytes" },
];

// --- measure ----------------------------------------------------------

let exitCode = 0;

for (const { key, path, baselineKey } of LOCALES) {
  const baseline = budget[baselineKey];
  if (typeof baseline !== "number" || baseline < 0) {
    console.log(
      `::warning title=WO-365 invalid budget::${BUDGET_FILE} is missing or has an invalid ${baselineKey} field.`
    );
    exitCode = 1;
    continue;
  }

  let catalog;
  try {
    catalog = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    console.log(`::warning title=WO-365 missing catalog::${path} not found.`);
    exitCode = 1;
    continue;
  }

  const subset = selectClientMessages(catalog);
  const measured = Buffer.byteLength(JSON.stringify(subset), "utf8");
  const threshold = baseline + Math.ceil((baseline * warnPct) / 100);

  console.log(
    `${key} client messages: ${label(
      measured
    )}  (budget: ${label(baseline)}, warn at +${warnPct}% = ${label(threshold)})`
  );

  if (measured > threshold) {
    const over = measured - threshold;
    console.error(
      `RSC message payload OVER BUDGET for ${key}: measured ${label(
        measured
      )}, threshold ${label(threshold)}, over by ${label(over)}. ` +
        `Update ${BUDGET_FILE} to ratchet the baseline.`
    );
    exitCode = 1;
  }
}

if (exitCode === 0) {
  console.log("RSC message payload within budget.");
}

process.exit(exitCode);
