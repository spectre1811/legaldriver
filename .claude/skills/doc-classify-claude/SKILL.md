---
name: doc-classify-claude
description: Use when classifying or extracting structured fields from documents/emails with Claude (doc type, best-match client/case, parties, dates, amounts, confidence) and filing by confidence. Fires on "classify document", "extract fields", "auto-file", "needs-review queue", "structured output from Claude", "confidence threshold". Codifies the structured-outputs call, the LLM-infers/code-files split, and the hallucination + fallback guards.
---

Classify a document/email against a shortlist of candidates and extract key fields, with guaranteed-valid JSON. Battle-tested in LexDriver. Consult the `claude-api` skill for current model IDs and exact SDK syntax before writing the call.

## The split (non-negotiable)
**LLM infers; deterministic code files and verifies.** Claude returns a classification + confidence; YOUR code decides filing. The model never auto-deletes, auto-sends, or self-grades.

## The call (Node SDK, structured outputs)
Use `@anthropic-ai/sdk` `messages.create` with `output_config.format` = a JSON Schema so the model returns schema-valid JSON (no brittle "return JSON only" prompting):
```ts
const res = await anthropic.messages.create({
  model: process.env.DOC_CLASSIFY_MODEL ?? "claude-haiku-4-5", // mechanical → Haiku per cost; Sonnet/Opus for harder extraction
  max_tokens: 1024,
  output_config: { format: { type: "json_schema", schema: SCHEMA } },
  messages: [{ role: "user", content: prompt }],
});
```
- Structured outputs are supported on Haiku 4.5 / Sonnet 4.6 / Opus 4.8 / Fable 5. **Don't set `effort` on Haiku 4.5** (errors).
- Schema rules: `additionalProperties: false` on every object; nullable via `type: ["string","null"]`; NO `minLength`/`maximum`/etc. (unsupported).
- Read the JSON from the text block and `JSON.parse` it (or use `messages.parse()` with a zod schema).

## Schema shape that works
`{ doc_type, client_id|null, matter_id|null, confidence (0..1), extracted:{parties[],dates[],amounts[],cnrs[]}, summary }`. Pass the tenant's clients/matters as an id:name shortlist in the prompt; instruct "only use ids from the lists, else null + low confidence."

## Guards (each one caught a real failure)
1. **Hallucinated ids** — the model can return an id not in your lists. After parsing, drop any `client_id`/`matter_id` not in the provided sets.
2. **No API key / API error / refusal** — wrap in try/catch and check `stop_reason === "refusal"`; return a safe **fallback** (`confidence: 0`, nulls, `doc_type: "other"`). This routes to needs-review instead of crashing — graceful degradation when `ANTHROPIC_API_KEY` is missing.
3. **Truncation** — keep `max_tokens` generous enough for the schema; tiny caps truncate JSON.

## Filing
`confidence >= THRESHOLD (env, default 0.7) AND (client_id || matter_id)` → auto-file. Else → **needs-review queue** with the model's top suggestion for one-click confirm. Default the inbox lens to grouped-by-client/case.

## Text extraction first
Extract deterministically before the LLM: pdf-parse/pdfjs for PDFs, native decode for text, OCR fallback (tesseract.js) for image-only scans (flag `needsOcr` when a PDF yields ~no text). Feed extracted text (truncated, e.g. 12k chars) to the classifier; fall back to subject+snippet for emails.

Pairs with [[gmail-oauth-ingest]] (source of docs) and [[supabase-rls-multitenant]] (tenant-scoped filing + storage).
