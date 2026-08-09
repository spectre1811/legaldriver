# Perimeter security & cost plan (WO-323, as-built)

Fulfills the dangling reference in the `public-app-abuse-control` skill. This is the **as-built**
perimeter after WO-323 moved legaldriver + peshi off Vercel onto one EC2 box behind a Cloudflare
tunnel. Full architecture: `legalmarketplace/plan/exec/design/2026-07-31-web-tier-self-host.md` (§7 is
the perimeter spec this implements).

## Posture
**Raise cost-per-record, shrink records-per-identity.** No auth wall on free search, no self-built
CAPTCHA, no UA/IP blocklist theater. Turnstile is a **step-up** — fired only when a per-identity
limiter trips — never on the happy path.

## Layers (outermost → innermost)
1. **Cloudflare edge** — TLS, CDN cache, DDoS scrub, and:
   - **Cache rules:** `/_next/static` + `/public` cached 1 yr immutable (the egress lever that kills the
     402 class); everything else bypasses cache (correctness; also cleared the stale Vercel-402 cache at
     cutover).
   - **WAF:** `*/api/cron/*` **blocked from the edge** (internal-only now — systemd timers hit
     `127.0.0.1`; the new risk from leaving Vercel — do NOT remove). Rate-limit rules on
     `/api/suggest`, `/search`, `/people`, `/api/search` + Bot Fight Mode = dashboard follow-ups
     (`web/FOUNDER-ACTIONS.md`).
2. **Origin cloaking** — the box has **zero SG ingress**; cloudflared dials OUT. The origin IP is never
   in DNS (resolves to Cloudflare) → un-DDoS-able, un-port-scannable.
3. **Trusted client IP** — Caddy passes `CF-Connecting-IP`; the apps read it as the client IP
   (`peshi upstream.ts`/`identity.ts`). Raw first-hop `X-Forwarded-For` is spoofable and is NOT trusted
   → an attacker can't forge the quota/identity key.
4. **App step-up (Turnstile)** — a per-identity sliding window (`peshi src/lib/abuse/step-up.ts`,
   `legaldriver src/lib/security/step-up.ts`) fires a Turnstile challenge on the expensive actions
   (peshi `/api/{refresh,order-fetch,track,data-request}`, legaldriver `/request-access`) once the soft
   cap trips **and** `TURNSTILE_SECRET_KEY` is set. Dormant until the keys are wired; the box's hard caps
   remain the backstop. CSP allows `challenges.cloudflare.com` (`headers.mjs`); a `report-uri` sink
   (`/api/csp-report`) makes the report-only phase actually observe.
5. **Cron auth fail-closed** — peshi + legaldriver crons 401 without the `CRON_SECRET`; the timers pass
   it, and the edge blocks external reach → defense-in-depth over the WAF rule.
6. **Webhooks (machine, no Turnstile)** — WhatsApp requires `WHATSAPP_APP_SECRET` on the live path
   (503 otherwise) + HMAC verify; telephony has HMAC verify + 503 when unconfigured (both landed in
   WO-311).
7. **Enumeration** — pagination caps + a max-response-size ceiling on the profile fetch-all
   (`peshi people.ts`); the FastAPI box keeps its 60/60s reads + 5/IP/hr fresh-fetch caps as the last
   backstop, now enforcing on the *real* forwarded IP.

## Cost (steady state)
| Item | $/mo |
|---|---|
| `t3.medium` on-demand (Mumbai) | ~24 |
| gp3 20 GB + CloudWatch alarms + egress (cached) | ~3 |
| Cloudflare free tier (CDN, WAF, Bot Fight, tunnel, Turnstile) | 0 |
| **Total** | **~$27/mo** |

Opt-in on a real trigger: CF Load Balancing $5 (2nd origin), CF Pro WAF $20 (attack signal), Upstash
(shared limiter store at origin #2). Convergence path (design §8): swap the systemd node units for the
ECR images → ECS Fargate. Right-size the box from the `mukadma-web-{cpu,mem,disk}` CloudWatch alarms,
not vibes.
