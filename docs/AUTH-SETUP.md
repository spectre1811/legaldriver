# Auth setup — Google + phone OTP (WO-30 W3)

The **app code is done** — `signInWithGoogle` action + "Continue with Google" button on `/login`, and
`/auth/callback` already exchanges the OAuth code for a session. Google sign-in lights up the moment the
provider is configured below (founder steps — nothing to deploy).

## Google — "Continue with Google"

### 1. Google Cloud Console (create OAuth credentials)
1. https://console.cloud.google.com → create/select a project.
2. **APIs & Services → OAuth consent screen** → *External* → app name (Mukadma), support email, logo;
   scopes `email` + `profile`; add the domain. Publish (or add test users while in testing).
3. **APIs & Services → Credentials → Create credentials → OAuth client ID** → *Web application*.
4. **Authorized JavaScript origins:** `https://legaldriver.vercel.app` (+ any custom domain, e.g. `https://mukadma.in`).
5. **Authorized redirect URI (critical — this is Supabase's callback, NOT the app's):**
   `https://johvrsvaspivmxqvpxcg.supabase.co/auth/v1/callback`
6. Copy the **Client ID** and **Client secret**.

### 2. Supabase dashboard
1. **Authentication → Providers → Google** → enable → paste Client ID + Client secret → save.
2. **Authentication → URL Configuration:**
   - **Site URL:** `https://legaldriver.vercel.app`
   - **Redirect URLs (allow-list):** add
     - `https://legaldriver.vercel.app/auth/callback`
     - `http://localhost:3000/auth/callback` (local dev)
     - (optional) `https://*.vercel.app/auth/callback` for preview deploys
3. Done. The button works. (`APP_BASE_URL` env is already the prod URL, so the app's `redirectTo`
   points at the right callback.)

**How it flows:** button → `signInWithOAuth({provider:'google', redirectTo: APP_BASE_URL/auth/callback})`
→ Google → Supabase `/auth/v1/callback` → app `/auth/callback` (`exchangeCodeForSession`) → `/dashboard`.
A new Google user gets a tenant + profile via the existing `handle_new_user` trigger (full_name comes
from the Google profile). Existing email+password users are unaffected — this is additive.

## Phone OTP — evaluation (needs an SMS provider, so deferred)
Supabase phone auth requires an **SMS gateway** configured under *Auth → Providers → Phone*
(Twilio / MessageBird / Vonage / MSG91 / Textlocal). In India this also needs **DLT registration**
(TRAI) for the sender header + template — a paid + compliance step.

**Recommendation:** defer standalone phone-OTP and fold it into **WO-04** — the WhatsApp BSP you're
setting up can deliver **WhatsApp-OTP**, which is the better fit for Indian advocates than SMS and
avoids a second vendor. Code seam when ready: `signInWithOtp({ phone })` + a verify step (not built
until the provider is chosen).
