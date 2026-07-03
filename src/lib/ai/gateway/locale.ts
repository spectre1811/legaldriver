import type { AiTask } from "./core";

// Multilingual at the gateway (04-AI §9, ADR-AI2): every AI feature answers in the
// user's language WITHOUT per-feature work, because the gateway injects a locale
// directive. Pure module (no I/O) so it stays unit-testable.

// Human-readable names for the directive. English is the default (no directive).
const LOCALE_NAMES: Record<string, string> = {
  hi: "Hindi",
  gu: "Gujarati",
  mr: "Marathi",
  bn: "Bengali",
  ta: "Tamil",
  te: "Telugu",
  en: "English",
};

// Only PROSE tasks localise their output. Classification/extraction stays in
// English (stable enums + field keys); a Hindi label would break downstream code.
const LOCALIZED_TASKS: ReadonlySet<AiTask> = new Set<AiTask>([
  "summary.case",
  "draft.document",
  "agent.lawyer",
  "agent.reply",
]);

// native = prompt the model directly in the target language (frontier models handle
// Indic languages well); bridge = translate-in/out around an English core. Stub:
// everything is `native` until an eval table (04-AI §9.2, §9.5) says otherwise —
// this is the seam where that per-(task,locale) decision will live.
export type LocaleMode = "native" | "bridge";
export function localeMode(_task: AiTask, _locale: string): LocaleMode {
  return "native";
}

// The instruction appended to the prompt for a localised call, or null when the
// call stays in English (default locale, unknown locale, or a non-prose task).
export function localeDirective(task: AiTask, locale?: string): string | null {
  if (!locale || locale === "en") return null;
  if (!LOCALIZED_TASKS.has(task)) return null;
  const name = LOCALE_NAMES[locale];
  if (!name) return null; // unknown locale → don't guess; answer in the prompt's language
  // Legal terms-of-art / citations kept in English with a gloss (04-AI §9 rule).
  return `Respond in ${name}. Keep statutory citations, section numbers, case numbers (CNR), party names, and legal terms-of-art in English, adding a short ${name} gloss only where it aids the reader.`;
}
