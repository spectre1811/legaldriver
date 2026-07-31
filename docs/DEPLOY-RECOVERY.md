# Deploy recovery — "merged but not live"

`main` **auto-deploys** to Vercel via native git integration on every merge (production branch =
`main`, `gitProviderOptions.createDeployments = enabled`). Both apps run on the **`yash-7758s-projects`**
team (account migration 2026-07-30; team `team_zHO6XOwreA9XPRcY1xKdrBlp`, still **Hobby** — keep crons
≤1×/day). Do **not** run `vercel --prod` by hand, **especially from a stale local checkout** — a manual
`--prod` of behind-HEAD code regresses the prod alias below `main`. See `CLAUDE.md` git flow.

## 1. Is prod current? (one curl — WO-63)

```sh
diff <(curl -s https://app.mukadma.in/api/health | jq -r .sha) <(git rev-parse origin/main) \
  && echo "prod == origin/main ✅" || echo "prod is BEHIND — recover below ⛔"
```

`/api/health` reports the exact `VERCEL_GIT_COMMIT_SHA` the running deployment was built from. The
`deploy-freshness` cron (`/api/cron/deploy-freshness`) automates the same comparison daily and writes
an ALARM row to `court_provider_health` on a stall past the 20m grace window.

## 2. Recovery — redeploy `main` HEAD (catches up the whole backlog)

If a merge did not deploy (quota blip, paused project, transient Vercel error), trigger a fresh
production build of `main` HEAD via the API — one deploy of HEAD catches up every un-shipped commit:

```sh
# needs NEW_TOKEN (in claude-vm.legaldriver.env) — the yash-7758s-projects account token
TEAM=team_zHO6XOwreA9XPRcY1xKdrBlp
curl -s -X POST "https://api.vercel.com/v13/deployments?teamId=$TEAM&forceNew=1" \
  -H "Authorization: Bearer $NEW_TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"legaldriver","project":"prj_2ldZrXq5j8ilA5tjy6tgtqar3GMw","target":"production",
       "gitSource":{"type":"github","repoId":1279614406,"ref":"main"}}' | jq '{id,url,readyState}'
# peshi: name=peshi-search, project=prj_rFj1tsJOhFc8AnOzLrFEsXt8LSaK, repoId=1288642780
```

Then poll to READY and re-run step 1:

```sh
curl -s "https://api.vercel.com/v13/deployments/<id>?teamId=$TEAM" \
  -H "Authorization: Bearer $NEW_TOKEN" | jq -r .readyState   # BUILDING → READY (or ERROR)
```

A `read ETIMEDOUT` from the Vercel CLI mid-deploy is **not** a build failure — the deployment exists;
poll `readyState` instead of retrying. Don't burn quota with manual probe deploys.

## 3. Escalation

- Repeated stalls → check `paused`, `gitProviderOptions.createDeployments`, and (on Hobby) the
  deploy/cron quota on `GET /v9/projects/{id}`.
- Alarm→notification last-mile (paging the founder on a red `deploy-freshness` row) is tracked
  separately (WO-60 Hermes). This runbook is the manual recovery until then.
