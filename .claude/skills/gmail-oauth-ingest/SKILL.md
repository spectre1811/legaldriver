---
name: gmail-oauth-ingest
description: Use when adding Gmail (or Google) OAuth + incremental email/attachment ingestion to an app. Fires on "connect Gmail", "gmail.readonly", "Google OAuth", "ingest emails", "fetch attachments", "historyId", "refresh token storage". Codifies the least-privilege scope, dedicated connect flow, encrypted refresh-token storage, incremental fetch, and the mock-first build pattern.
---

Connect a Gmail account and ingest new messages + attachments on a schedule, least-privilege and securely. Battle-tested in LexDriver.

## What the user must provide (and what they must NOT)
They create an **OAuth 2.0 Client (Web application)** in Google Cloud Console and give you two strings: `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`. They do NOT hand you a token — the app runs the OAuth flow itself. Their console steps:
1. Enable the **Gmail API**.
2. OAuth consent screen: External, **publishing status "Testing"**, add the user as a **test user**, add scope `.../auth/gmail.readonly`.
3. Create Web-application client; add redirect URI `${APP_BASE_URL}/api/google/callback` (local + prod).
Production use of `gmail.readonly` (a restricted scope) needs a security assessment — OUT of MVP scope; "Testing" + test users is enough for a demo. Say this explicitly.

## Connect flow (dedicated, decoupled from app login)
- `/api/google/connect` (authed): set a random CSRF `state` cookie, redirect to Google with `scope=gmail.readonly`, `access_type=offline`, `prompt=consent` (these two are REQUIRED to get a refresh token), `response_type=code`.
- `/api/google/callback`: verify `state` == cookie; exchange code at `https://oauth2.googleapis.com/token`; you get `refresh_token` (only present with offline+consent — if missing, tell the user to revoke prior access and reconnect).
- **Store the refresh token ENCRYPTED** (Supabase Vault — see [[supabase-rls-multitenant]]). Persist only the secret id in `oauth_connection.refresh_token_ref`. Never plaintext, never in logs.

## Incremental fetch (the cron)
- Refresh access token from the stored refresh token each run.
- Use `users.history.list?startHistoryId=...&historyTypes=messageAdded` for deltas; fall back to `messages.list` (bounded backfill) + `users.getProfile.historyId` on first run. Persist the new `historyId`.
- `messages.get?format=full` → walk the MIME tree recursively for `text/plain` body and attachments; download attachments via `messages.attachments.get` (base64url → bytes).
- Put raw files in private object storage; create document rows; dedupe on (tenant, gmail message id).

## Build pattern: mock first
Define a `MailClient` interface (`fetchNew(sinceHistoryId)`) with a **mock mailbox** (realistic legal emails + text attachments) so the entire ingest→parse→file pipeline runs offline with zero Google creds. Flip to the live Gmail adapter when creds arrive. This decouples the build from an external dependency you don't control.

## Guardrails (hard)
- Least-privilege scope only (`gmail.readonly`). Request the narrowest that works.
- NEVER log email bodies, tokens, or PII. Log subject/recipient-domain at most.
- The pipeline classifies/files; it never auto-deletes or auto-sends.
- Provide a disconnect path (mark connection revoked; optionally revoke the token with Google).

Pairs with [[doc-classify-claude]] for the parse-and-file step and [[supabase-rls-multitenant]] for tenant-scoped storage + Vault.
