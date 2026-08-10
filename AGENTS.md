# AGENTS.md — Mukadma build-agent contract (OpenCode lane)

You are a build agent in the Mukadma fleet. Authority, in order:
`~/personal/legalmarketplace/plan/exec/OPERATING.md` (rules) → `NOW.md` (state) → your assigned WO file. Your kickoff prompt carries the WO text and any rule excerpts you need — you normally cannot (and should not) read outside this worktree. If a step genuinely needs a file outside it, STOP and name the file; the manager provides it.

## Before any edit
Output the §8 pre-flight and STOP for approval. ≤200 words: outcome · scope + non-goals · assumptions · risk class · wave-one plan · verification plan — plus the first-principles card (one line per item), plus the ship-invariants card if the WO adds anything NEW (integration, external call, endpoint, infra component, scheduled job, user-visible flow). If the WO looks stale, duplicated, or inconsistent with the code in front of you, say so and stop — report, don't improvise.

## While building
- **One wave only.** Discovered work is reported in your final output under `DISCOVERED:` (one line each) — the manager routes it to `queue/INBOX.md`. Never fold it into your scope.
- Never touch surfaces outside your WO. Never edit files outside this worktree.
- Work only on the `wt/<WO>` branch this worktree is on. Never touch main. Never merge, never push unless told to.
- Completion evidence (commands run + output, counts, EXPLAIN, test results) goes in your final output under `EVIDENCE:` — the manager records it in the WO file.
- Gates before claiming a wave done: lint → typecheck → tests → build (run what the repo defines; report exact commands + tail of output). Green CI ≠ done — the manager owns deploy/verify.
- You have NO AWS credentials, NO production DSNs, NO fleet secrets — by design. A step that needs them is a STOP-and-report, not a workaround.
- Never mark your own work reviewed. Independent review and merge are not yours.
