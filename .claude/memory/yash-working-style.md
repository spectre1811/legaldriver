---
name: yash-working-style
description: "How Yash wants the LexDriver build run — autonomous, provision infra himself-delegated"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 01576ca6-b548-4a76-8884-dbb260336242
---

Yash is hands-off and wants me to drive the build. He hands over live tokens and says "take
all you need by yourself" (gave a Supabase management token and told me to provision the
project myself; gave the eCourtsIndia API token directly).

**Why:** he wants velocity and to delegate execution, not micromanage.

**How to apply:** When given a token, provision/configure infra autonomously (used the Supabase
Management API to read keys + apply migrations). Reuse his existing conventions (see
[[court-data-own-datastore-direction]] and the project CLAUDE.md). Build in the brief's phases
and checkpoint after each. Secrets go in the git-ignored .env, never committed.

**Don't over-ask.** He dislikes being peppered with AskUserQuestion prompts — once said "i
answered already, continue." Proceed with sensible defaults and only surface a real blocker or
something only he can provide (e.g. Google OAuth, a real CNR he chooses to share). Prefer
mock/public data over asking him for inputs.
