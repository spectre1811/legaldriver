---
name: classifier-local-claude-cli
description: "LexDriver document classification runs via the local Claude Code CLI, not a paid API key"
metadata: 
  node_type: memory
  type: project
  originSessionId: 01576ca6-b548-4a76-8884-dbb260336242
---

Yash directed (2026-06-24): instead of an ANTHROPIC_API_KEY, use the local Claude Code
CLI as the inference engine for document classification. The `.env` ANTHROPIC_API_KEY is
intentionally empty.

**Why:** avoid paying for / managing an API key; the machine already has Claude Code
authed (OAuth creds in ~/.claude/.credentials.json).

**How it works:** `src/lib/ai/claude-cli.ts` shells out to `claude -p --output-format json`
in-process (tools disabled, minimal system prompt, ANTHROPIC_API_KEY dropped from child
env so OAuth is used, timeout+kill, session transcript cleaned up). `src/lib/ai/complete.ts`
routes by `CLASSIFIER_BACKEND` (auto|api|cli|off): api when a key is set, else cli.

**How to apply / constraints:**
- It's IN-PROCESS only, deliberately NOT a public HTTP endpoint — shelling out to Claude
  Code (which has Bash/Write tools) behind a network route would be an RCE surface.
- Works locally/self-hosted only (needs the `claude` binary + OAuth). It will NOT work on
  Vercel — for prod classification, set ANTHROPIC_API_KEY and the router auto-switches to api.
- ~12s/call, ~$0.02/call (Claude Code prompt overhead). Fine for demo; use api for scale.
- See [[yash-working-style]] (think-around-it, make proper choices) and the
  `doc-classify-claude` skill at ~/.claude/skills/.
