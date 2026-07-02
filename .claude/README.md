# .claude — Claude Code project context

Portable context so a fresh clone (or a teammate) starts with the same shared
understanding of this project. Committed on purpose; local/secret bits are gitignored.

## Contents
- `memory/` — durable project memory (working style, architecture, decisions,
  deployment gotchas, cost/legal-risk preferences). `MEMORY.md` is the index; each
  linked file holds one fact.
- `skills/` — project skills, **auto-loaded by Claude Code from `.claude/skills/`
  (no setup needed in a clone)**: `doc-classify-claude`, `ecourts-api-client`,
  `gmail-oauth-ingest`, `supabase-rls-multitenant` — each codifies a hard-won pattern
  (structured-output classification; licensed-court-API/no-scrape rule + CourtDataClient;
  Gmail OAuth ingest; multi-tenant RLS + the Next fetch-cache gotcha).
- Project instructions live in the repo-root **`CLAUDE.md`** (Claude Code loads it
  automatically) — read it first.

## Using this after cloning
Claude Code auto-loads memory from `~/.claude/projects/<encoded-abs-path>/memory/`,
which is keyed to your local absolute clone path — so it won't auto-load from here.
To activate this memory in your clone, copy it into place:

```bash
# from the repo root, after cloning:
DEST="$HOME/.claude/projects/$(pwd | sed 's#/#-#g')/memory"
mkdir -p "$DEST" && cp .claude/memory/*.md "$DEST/"
```

Then Claude Code will load it on the next session. (Re-run after moving the clone.)

## Global / "org-level" config — reproduce in a clone (deliberately, not auto-committed)
The 4 skills above ARE the project's custom (org-level) skills — committed here. The
rest of `~/.claude` is intentionally NOT committed (third-party, personal, or secret);
reproduce what you want:

- **Plugin marketplace** (installed globally): `anthropics/claude-plugins-official`
  (github, playwright, terraform, linear, session-report, plugin-dev, …). Re-add in a
  clone with: `/plugin marketplace add anthropics/claude-plugins-official` — don't
  copy the marketplace repo in here (it's public + large + self-updating).
- **Personal settings** (`~/.claude/settings.json`) used on the build box:
  `{ "theme": "dark", "tui": "fullscreen", "skipDangerousModePermissionPrompt": true }`.
  Left to each developer — especially `skipDangerousModePermissionPrompt`, a safety
  toggle you should opt into consciously, not inherit from a repo.

## Never committed (gitignored / lives only in ~/.claude)
`.credentials.json`, chat history/transcripts (`*.jsonl`), `settings.local.json`,
caches. Secrets stay in `.env` (also gitignored) — see `.env.example` for the keys.
