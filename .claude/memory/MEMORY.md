# Memory index — LexDriver (legaldriver)

- [Court-data own-datastore direction](court-data-own-datastore-direction.md) — build our own court data over time, never scrape/CAPTCHA
- [Yash working style](yash-working-style.md) — hands-off, provision infra autonomously when given tokens
- [Classifier: local Claude CLI](classifier-local-claude-cli.md) — doc classification uses local `claude` CLI, no API key
- [Deployment (Vercel)](deployment-vercel.md) — live at legaldriver.vercel.app; env/cron/auth-URL gotchas
- [Phase 3 architecture](phase3-architecture.md) — services = env-switched modular monolith; what's keyless vs gated
- [Court corpus storage limit](court-corpus-storage-limit.md) — corpus exceeds Supabase Free 500MB; keep small or move off app DB
- [Cost & legal-risk preferences](cost-and-legal-risk-preferences.md) — prefer keyless/on-box over paid cloud APIs; human-gate legal-risk automation
