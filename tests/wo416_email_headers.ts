// WO-416 · email deliverability headers — threading + List-Unsubscribe, offline, no DB/network.
// Hard-gated: proves, per kind, the exact header/suppression rules the send path must obey.
// Run: npx tsx tests/wo416_email_headers.ts
//
// Coverage (amendment #6):
//   threaded vs unthreaded · unsubscribe headers present vs ABSENT on OTP/security ·
//   token verifies · tampered signature rejected · wrong-tenant/wrong-user scope rejected ·
//   an ec- share token rejected · channel_email=false skips a non-transactional kind but
//   NEVER an OTP (transactional).

process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-secret-01234567890";
process.env.NEXT_PUBLIC_APP_URL = "https://app.mukadma.in";

import { signShareToken, verifyShareToken } from "@/lib/court/share-token";
import {
  signUnsubscribeToken,
  verifyUnsubscribeToken,
} from "@/lib/notify/unsubscribe-token";
import {
  EMAIL_KINDS,
  isTransactionalKind,
  asEmailKind,
  shouldSuppressEmail,
  buildEmailHeaders,
} from "@/lib/notify/email-headers";
import { deliverEmail } from "@/lib/notify/deliver/email";
import type { Mailer, SendResult } from "@/lib/notify/mailer";
import type { NotifyRow } from "@/lib/notify/pickup";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/database.types";

let failed = 0;
function ok(name: string, cond: boolean) {
  console.log(`${cond ? "✓" : "✗ FAIL"} ${name}`);
  if (!cond) failed++;
}

// ── unsubscribe token: sign/verify round trip, no expiry ─────────────────────
{
  const token = signUnsubscribeToken("tenant-A", "profile-U1", "email");
  ok("token carries the uo- prefix (distinct from ec-)", token.startsWith("uo-"));
  ok("token is exactly two base64url segments joined by one .", token.split(".").length === 2);

  const v = verifyUnsubscribeToken(token);
  ok("verify: ok", v.ok);
  if (v.ok) {
    ok("verify: tenantId round-trips", v.tenantId === "tenant-A");
    ok("verify: profileId round-trips", v.profileId === "profile-U1");
    ok("verify: channel round-trips", v.channel === "email");
  }

  // No expiry (amendment #3): the payload must NOT embed an `exp` — a link works forever.
  const payloadRaw = token.slice(3).split(".")[0];
  const decoded = JSON.parse(Buffer.from(payloadRaw, "base64url").toString("utf8"));
  ok("token carries NO exp (never expires)", !("exp" in decoded));
  ok("token payload is exactly {t,u,k} (no PII, no plaintext ids)", Object.keys(decoded).sort().join(",") === "k,t,u");
}

// ── tamper resistance: scope can never be widened/redirected ─────────────────
{
  const token = signUnsubscribeToken("tenant-A", "profile-U1", "email");
  const [payloadB64, sig] = token.slice(3).split(".");

  // Re-point at a DIFFERENT tenant+user under the OLD signature.
  const forgedPayload = Buffer.from(JSON.stringify({ t: "tenant-B", u: "profile-U2", k: "email" })).toString("base64url");
  ok("wrong-tenant/wrong-user payload under the old signature is rejected", !verifyUnsubscribeToken(`uo-${forgedPayload}.${sig}`).ok);

  // Re-point the CHANNEL (email → whatsapp) — must fail too (scope is tenant+user+channel).
  const chanPayload = Buffer.from(JSON.stringify({ t: "tenant-A", u: "profile-U1", k: "whatsapp" })).toString("base64url");
  ok("a re-channeled payload under the old signature is rejected", !verifyUnsubscribeToken(`uo-${chanPayload}.${sig}`).ok);

  // Bit-flip the signature itself.
  const flippedSig = sig.slice(0, -1) + (sig.at(-1) === "A" ? "B" : "A");
  ok("a bit-flipped signature is rejected", !verifyUnsubscribeToken(`uo-${payloadB64}.${flippedSig}`).ok);

  ok("garbage input is rejected, not thrown", !verifyUnsubscribeToken("not-a-real-token").ok);
  ok("empty string is rejected", !verifyUnsubscribeToken("").ok);
  ok("missing prefix (raw payload.sig) is rejected", !verifyUnsubscribeToken(`${payloadB64}.${sig}`).ok);
}

// ── cross-tenant/user scope: two tokens never collide ────────────────────────
{
  const a = signUnsubscribeToken("tenant-A", "profile-U1", "email");
  const b = signUnsubscribeToken("tenant-B", "profile-U1", "email");
  ok("same profile, different tenant → different tokens", a !== b);
  const va = verifyUnsubscribeToken(a);
  const vb = verifyUnsubscribeToken(b);
  ok("tenant A's token verifies to tenant A", va.ok && va.tenantId === "tenant-A" && va.profileId === "profile-U1");
  ok("tenant B's token verifies to tenant B", vb.ok && vb.tenantId === "tenant-B");
}

// ── token families are NOT interchangeable ───────────────────────────────────
{
  const ec = signShareToken("tenant-A", "matter-1", 3600).token;
  ok("an ec- share token is rejected by the unsubscribe verifier", !verifyUnsubscribeToken(ec).ok);

  const uo = signUnsubscribeToken("tenant-A", "profile-U1", "email");
  ok("a uo- unsubscribe token is rejected by the share verifier", !verifyShareToken(uo).ok);
}

// ── fail-closed when the signing secret is unset ─────────────────────────────
{
  const saved = process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.SHARE_LINK_SECRET;
  let threw = false;
  try { signUnsubscribeToken("t", "u", "email"); } catch { threw = true; }
  ok("signUnsubscribeToken throws (fail-closed) when unset", threw);
  const vUnconfigured = verifyUnsubscribeToken("uo-abc.def");
  ok("verifyUnsubscribeToken reports unconfigured (not a false pass)", !vUnconfigured.ok && vUnconfigured.reason === "unconfigured");
  process.env.SUPABASE_SERVICE_ROLE_KEY = saved;
}

// ── classification is exhaustive: exactly the five transactional kinds ───────
{
  const transactional = ["security", "otp", "invoice", "receipt", "welcome"];
  const nonTransactional = ["hearing_reminder", "deadline_reminder", "notice_escalation", "ipr_renewal", "case_update", "daily_hearings", "cause_list_alert", "trackConfirm"];
  ok("EMAIL_KINDS is the exact union (13 kinds, no extras)", EMAIL_KINDS.length === 13 && [...transactional, ...nonTransactional].every((k) => (EMAIL_KINDS as readonly string[]).includes(k)));

  for (const k of transactional) ok(`transactional: ${k}`, isTransactionalKind(k as (typeof EMAIL_KINDS)[number]));
  for (const k of nonTransactional) ok(`non-transactional: ${k}`, !isTransactionalKind(k as (typeof EMAIL_KINDS)[number]));

  ok("asEmailKind maps a known kind", asEmailKind("case_update") === "case_update");
  ok("asEmailKind returns null for an unknown kind (never a silent default)", asEmailKind("some_future_kind") === null);
}

// ── header building: threaded vs unthreaded ──────────────────────────────────
{
  const from = "notify@mukadma.in";
  const matterLinked = buildEmailHeaders({
    kind: "case_update", matterId: "MATTER-9F86", tenantId: "t1", profileId: "u1", from, messageId: "ROW-ABCD",
  });
  ok("matter-linked: carries a Message-ID", "Message-ID" in matterLinked);
  ok("matter-linked: Message-ID is <n.<id>@domain>, lowercased", matterLinked["Message-ID"] === "<n.row-abcd@mukadma.in>");
  ok("matter-linked: carries References to the stable matter root", matterLinked["References"] === "<matter.matter-9f86@mukadma.in>");
  ok("matter-linked (non-transactional): carries List-Unsubscribe", "List-Unsubscribe" in matterLinked);
  ok("matter-linked: carries List-Unsubscribe-Post (RFC 8058)", matterLinked["List-Unsubscribe-Post"] === "List-Unsubscribe=One-Click");
  ok("matter-linked: List-Unsubscribe is https-only (NO mailto — no monitored inbox)", /^<https:\/\/[^>]+>$/.test(matterLinked["List-Unsubscribe"]) && !matterLinked["List-Unsubscribe"].includes("mailto"));

  const unthreaded = buildEmailHeaders({
    kind: "daily_hearings", matterId: null, tenantId: "t1", profileId: "u1", from, messageId: "ROW-X",
  });
  ok("non-matter (daily_hearings): NO Message-ID", !("Message-ID" in unthreaded));
  ok("non-matter (daily_hearings): NO References", !("References" in unthreaded));
  ok("non-matter (daily_hearings): still carries List-Unsubscribe (non-transactional)", "List-Unsubscribe" in unthreaded);
}

// ── trackConfirm threads to the SAME matter root as a later reminder ─────────
{
  const from = "notify@mukadma.in";
  const matterId = "00000000-0000-4000-8000-00000000000aa";
  const track = buildEmailHeaders({ kind: "trackConfirm", matterId, tenantId: "t1", profileId: "u1", from, messageId: "row-track" });
  const remind = buildEmailHeaders({ kind: "hearing_reminder", matterId, tenantId: "t1", profileId: "u1", from, messageId: "row-remind" });

  ok("trackConfirm: threads to the SAME matter root as a later hearing_reminder", track["References"] === remind["References"] && track["References"] === `<matter.${matterId}@mukadma.in>`);
  ok("trackConfirm: carries its own distinct Message-ID (no cross-matter collision)", track["Message-ID"] !== remind["Message-ID"] && track["Message-ID"] === "<n.row-track@mukadma.in>");
  ok("trackConfirm: non-transactional → carries List-Unsubscribe", "List-Unsubscribe" in track && "List-Unsubscribe-Post" in track);
}

// ── header building: transactional kinds carry NO unsubscribe header ─────────
{
  const from = "notify@mukadma.in";
  for (const k of ["security", "otp", "invoice", "receipt", "welcome"] as const) {
    const h = buildEmailHeaders({ kind: k, matterId: null, tenantId: "t1", profileId: "u1", from });
    ok(`transactional ${k}: NO List-Unsubscribe`, !("List-Unsubscribe" in h) && !("List-Unsubscribe-Post" in h));
    ok(`transactional ${k}: unthreaded (no Message-ID/References)`, !("Message-ID" in h) && !("References" in h));
  }
}

// ── the https unsubscribe link embeds a verifiable, correctly-scoped token ───
{
  const from = "notify@mukadma.in";
  const h = buildEmailHeaders({ kind: "hearing_reminder", matterId: "m-1", tenantId: "tenant-A", profileId: "profile-U1", from, messageId: "row-1" });
  const m = /<(https:\/\/[^>]+)>/.exec(h["List-Unsubscribe"]);
  ok("https unsubscribe URL present", !!m);
  const url = new URL(m![1]);
  const token = url.pathname.split("/").pop() ?? "";
  const v = verifyUnsubscribeToken(token);
  ok("embedded token verifies", v.ok);
  ok("embedded token is scoped to the right tenant+user+channel", v.ok && v.tenantId === "tenant-A" && v.profileId === "profile-U1" && v.channel === "email");
}

// ── suppression predicate (the exact gate deliverEmail uses) ─────────────────
{
  ok("suppress: non-transactional + channel_email=false → skip", shouldSuppressEmail("case_update", false));
  ok("suppress: non-transactional + channel_email=true → send", !shouldSuppressEmail("case_update", true));
  ok("suppress: trackConfirm (non-transactional) + off → skip", shouldSuppressEmail("trackConfirm", false));
  ok("suppress: unknown kind + off → skip (fail-safe)", shouldSuppressEmail("future_kind", false));
  for (const k of ["security", "otp", "invoice", "receipt", "welcome"] as const) {
    ok(`suppress: transactional ${k} NEVER skipped even when off`, !shouldSuppressEmail(k, false));
  }
}

// ── behavioural: deliverEmail skips a suppressed non-transactional recipient ─
type DB = SupabaseClient<Database>;

class RecordingMailer implements Mailer {
  readonly channel = "email" as const;
  sends: { to: string; headers?: Record<string, string> }[] = [];
  async send(to: string, _s: string, _h: string, _t?: string, opts?: { headers?: Record<string, string> }): Promise<SendResult> {
    this.sends.push({ to, headers: opts?.headers });
    return { ok: true, id: "em_test" };
  }
}

function makeAdmin(channelEmail: boolean | null) {
  const notifUpdates: { id: string; status: string }[] = [];
  let pendingId = "";
  let pendingUpdate: Record<string, unknown> | null = null;
  const from = (table: string) => {
    const node: any = {
      select: () => node,
      eq: (c: string, v: unknown) => { if (c === "id" && table === "notification") pendingId = String(v); return node; },
      in: () => node,
      update: (vals: Record<string, unknown>) => { if (table === "notification") pendingUpdate = vals; return node; },
      maybeSingle: async () => {
        if (table === "notification_prefs") return channelEmail === null ? { data: null, error: null } : { data: { channel_email: channelEmail }, error: null };
        return { data: null, error: null };
      },
      insert: async () => ({ error: null }),
      then: (resolve: (v: unknown) => void) => {
        if (table === "notification" && pendingUpdate) {
          notifUpdates.push({ id: pendingId, status: String(pendingUpdate.status) });
          pendingUpdate = null;
        }
        resolve({ error: null });
      },
    };
    return node;
  };
  return {
    notifUpdates,
    supabase: {
      from,
      auth: { admin: { getUserById: async () => ({ data: { user: { email: "adv@example.com" } }, error: null }) } },
    } as unknown as DB,
  };
}

const depsFor = () => ({
  isDeadRef: () => false,
  flipTerminal: async () => {},
  handled: new Set<string>(),
  now: new Date("2026-08-13T10:00:00Z"),
});

async function behavioural() {
  {
    // channel_email=false → skipped, never sent, terminal-flipped.
    const mailer = new RecordingMailer();
    const { supabase, notifUpdates } = makeAdmin(false);
    const row: NotifyRow = { id: "r1", tenant_id: "t1", user_id: "u1", channel: "email", kind: "case_update", payload: { matterId: "00000000-0000-4000-8000-000000000001", title: "A v. B", change: "New order", court: "HC", cnr: "CNR1" } };
    const r = await deliverEmail(supabase, mailer, row, depsFor());
    ok("behaviour: suppressed recipient → mailer NOT called", mailer.sends.length === 0);
    ok("behaviour: suppressed recipient → result.suppressed is true", r.suppressed === true);
    ok("behaviour: suppressed recipient → row terminal-flipped to 'dead'", notifUpdates.length === 1 && notifUpdates[0].id === "r1" && notifUpdates[0].status === "dead");
  }

  {
    // channel_email=true (or no prefs row) → sent, and headers are attached.
    const mailer = new RecordingMailer();
    const { supabase } = makeAdmin(true);
    const row: NotifyRow = { id: "r2", tenant_id: "t1", user_id: "u1", channel: "email", kind: "case_update", payload: { matterId: "00000000-0000-4000-8000-000000000002", title: "C v. D", change: "Bench changed", court: "HC", cnr: "CNR2" } };
    const r = await deliverEmail(supabase, mailer, row, depsFor());
    ok("behaviour: enabled recipient → mailer called", mailer.sends.length === 1);
    ok("behaviour: enabled recipient → not suppressed", r.suppressed === false);
    ok("behaviour: enabled recipient → send carried threading + unsubscribe headers", !!mailer.sends[0].headers?.["References"] && !!mailer.sends[0].headers?.["List-Unsubscribe"]);
  }

  {
    // No prefs row (channelEmail null) → default on → still sent (never falsely suppressed).
    const mailer = new RecordingMailer();
    const { supabase } = makeAdmin(null);
    const row: NotifyRow = { id: "r3", tenant_id: "t1", user_id: "u1", channel: "email", kind: "case_update", payload: { matterId: "00000000-0000-4000-8000-000000000003", title: "E v. F", change: "New order", court: "HC", cnr: "CNR3" } };
    const r = await deliverEmail(supabase, mailer, row, depsFor());
    ok("behaviour: no prefs row → default on → sent", mailer.sends.length === 1 && r.suppressed === false);
  }
}

behavioural()
  .then(() => {
    console.log(failed === 0 ? "\nWO-416 EMAIL HEADERS: PASS" : `\nWO-416 EMAIL HEADERS: FAIL (${failed})`);
    process.exit(failed === 0 ? 0 : 1);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
