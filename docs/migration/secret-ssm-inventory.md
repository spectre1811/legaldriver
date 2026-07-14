# legaldriver — secret → SSM Parameter Store inventory (WO-142 W0)

_Generated 2026-07-14 for WO-142 W0 (inert prep). Source: `grep process.env` across
`src/` + config (89 distinct vars). No values are recorded here — names + placement only._

## Placement rules (from WO-142 §Cost/networking)

- **SSM Parameter Store `SecureString`** (KMS CMK) — default home for **all** app secrets.
  Free per-parameter; the Fargate task reads them via `valueFrom` in the task definition
  (task-execution role needs `ssm:GetParameters` + `kms:Decrypt` on the CMK).
- **AWS Secrets Manager** — reserved for **rotating** credentials only: the future **RDS
  connection string** (created at W4) and, if we enable rotation, the DB master / service
  key. Secrets Manager is ~$0.40/secret/mo, so we do NOT scatter the ~22 static API keys
  there — SSM SecureString is free and sufficient (matches the WO: "Secrets Manager only
  for rotating DB creds").
- **SSM Parameter Store `String`** — non-secret config (base URLs, model ids, flags,
  thresholds, regions).
- **Docker build-arg** — `NEXT_PUBLIC_*` only: inlined into the client bundle at build
  time, so they are set at `docker build`, not stored for runtime.
- **Task IAM role (no stored value)** — static AWS access keys are **removed**; the Fargate
  task role grants S3/Athena access directly.
- **Drop** — platform-injected Vercel vars and test-only vars have no place on Fargate.

Path convention: **`/mukadma/legaldriver/<env>/<KEY>`** ( `<env>` ∈ `prod` | `staging` | `demo` ).

## Summary

| Bucket | Count |
|---|---|
| Secrets → **Secrets Manager** (rotating) | 1 now + 1 future (RDS URL) |
| Secrets → **SSM SecureString** | 22 |
| Config → **SSM String** | 50 |
| Public → **Docker build-arg** | 3 |
| AWS keys → **task IAM role** (drop static) | 2 |
| Platform / test → **drop** | 11 |

## Secrets → AWS Secrets Manager (rotating)

| Env var | Notes |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Master key that bypasses RLS (34 service-role call sites — see postgrest-call-inventory). Rotating-capable → Secrets Manager. Post-cutover it becomes the self-hosted GoTrue/RDS admin credential. |
| _(future)_ `DATABASE_URL` / RDS creds | Does not exist yet; created at W4 (RDS + PgBouncer). The one thing Secrets Manager is really for. |

## Secrets → SSM SecureString (non-rotating)

Provider & integration keys:
`ANTHROPIC_API_KEY`, `DEEPSEEK_API_KEY`, `LLM_API_KEY`, `LITELLM_API_KEY`, `STT_API_KEY`,
`LD_API_KEY`, `INDIANKANOON_API_KEY`, `VAKEEL360_API_KEY`, `ECOURTSINDIA_API_TOKEN`,
`GOOGLE_VISION_API_KEY`, `GOOGLE_OAUTH_CLIENT_SECRET`, `RESEND_API_KEY`,
`LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, `POSTHOG_KEY`, `WHATSAPP_APP_SECRET`,
`WHATSAPP_BSP_API_KEY`, `WHATSAPP_BSP_TOKEN`, `WHATSAPP_BSP_WEBHOOK_VERIFY_TOKEN`,
`CRON_SECRET`, `GITHUB_FRESHNESS_TOKEN`, `GITHUB_PAT`.

> Note: `LANGFUSE_PUBLIC_KEY` and `WHATSAPP_BSP_PHONE_NUMBER_ID` are only pseudo-secret, but
> storing them as SecureString costs nothing and keeps the boundary simple.

## AWS keys → Fargate task IAM role (remove static keys)

| Env var | Action |
|---|---|
| `CORPUS_AWS_ACCESS_KEY_ID` | **Delete** — grant S3/Athena via the task role instead. |
| `CORPUS_AWS_SECRET_ACCESS_KEY` | **Delete** — same. Removing long-lived keys is a security + audit win. |

## Config → SSM String (non-secret)

- **Base URLs:** `APP_BASE_URL`, `LD_API_BASE`, `DEEPSEEK_BASE_URL`, `LLM_BASE_URL`,
  `LITELLM_BASE_URL`, `LANGFUSE_HOST`, `POSTHOG_HOST`, `ECOURTSINDIA_BASE_URL`,
  `WHATSAPP_BSP_BASE_URL`, `WHATSAPP_BSP_PHONE_NUMBER_ID`.
- **Model / provider selectors:** `LLM_PROVIDER`, `LLM_MODEL`, `DEEPSEEK_MODEL`,
  `LITELLM_MODEL`, `EMBED_MODEL`, `DOC_CLASSIFY_MODEL`, `CLASSIFIER_BACKEND`,
  `COURT_DATA_PROVIDER`, `MESSAGING_PROVIDER`, `OCR_PROVIDER`, `STT_PROVIDER`,
  `TELEPHONY_PROVIDER`.
- **Flags / thresholds / timeouts:** `CONFIDENCE_THRESHOLD`, `COURT_PARTY_TEXT_SEARCH`,
  `DRAFT_PRECEDENT`, `JUDGMENT_TEXT_GROUNDING`, `OCR_FALLBACK`, `OCR_MAX_PAGES`,
  `OCR_MIN_CONFIDENCE`, `COURT_CACHE_TTL_MS`, `DEPLOY_GRACE_MIN`,
  `ONBOARDING_DRAIN_MAX_RUNS`, `ONBOARDING_DRAIN_STALE_MINUTES`, `REFRESH_MAX_PER_RUN`,
  `LD_API_TIMEOUT_MS`, `LD_API_CANARY_TIMEOUT_MS`, `LD_API_CANARY_BAR_ID`,
  `LD_REFRESH_TIMEOUT_MS`, `MESSAGING_DEFAULT_TENANT_ID`.
- **OCR toolchain config:** `SURYA_OCR_CMD`, `SURYA_TIMEOUT_MS`, `TESSERACT_DATA`,
  `TESSERACT_LANG_PATH`, `TESSERACT_LANGS`.
- **Corpus / Athena:** `ATHENA_DB`, `ATHENA_OUTPUT`, `CORPUS_BUCKET`, `CORPUS_AWS_REGION`.
- **Misc:** `FROM_EMAIL`, `GITHUB_REPO`.

## Public → Docker build-arg (inlined at build)

`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_PRICING_PUBLIC`.

> `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` are baked into the client
> bundle → they change at the DB/auth cutover (W4). Because the app's data access is 100%
> **server-side** (postgrest-call-inventory: browser client is dead code), these two only
> feed supabase-js **auth** on the client; they follow GoTrue's public URL after cutover.

## Platform-injected / test-only → drop

- **Vercel (drop, platform-specific):** `VERCEL_ENV`, `VERCEL_REGION`,
  `VERCEL_GIT_COMMIT_MESSAGE`, `VERCEL_GIT_COMMIT_REF`, `VERCEL_GIT_COMMIT_SHA`
  → surface a commit SHA via a Docker build-arg if any UI needs it.
- **Runtime-set (not stored):** `NODE_ENV`, `CI`.
- **Test-only (not in prod runtime):** `E2E_BASE_URL`, `E2E_WEBSERVER_CMD`, `DEMO_MODE`
  (`DEMO_MODE` stays an SSM `String` **only** in the isolated demo env).

## Cross-references

- Data-access port map: `postgrest-call-inventory.md`
- DB replication readiness: `replica-identity-audit.md` (all 51 tables PK-ready; no
  `REPLICA IDENTITY FULL` needed)
