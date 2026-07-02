# .claude — Claude Code project context

Portable context so a fresh clone (or a teammate) starts with the same shared
understanding of this project. Committed on purpose; local/secret bits are gitignored.

## Contents
- `memory/` — durable project memory (working style, architecture, decisions,
  deployment gotchas, cost/legal-risk preferences). `MEMORY.md` is the index; each
  linked file holds one fact.
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

## Never committed (gitignored / lives only in ~/.claude)
`.credentials.json`, chat history/transcripts (`*.jsonl`), `settings.local.json`,
caches. Secrets stay in `.env` (also gitignored) — see `.env.example` for the keys.
