// WO-311 · Inbound messaging webhooks must resolve a real tenant or fail closed.
//
// Offline: no network, no secrets, no DB. Every PostgREST call and the ops-alert
// POST are served by an in-process fetch stub, so the REAL route handlers run end
// to end and we can count exactly what they wrote — which is the only honest way
// to assert "writes ZERO msg_message rows".
//
// Acceptance drills (WO-311):
//   (i)   an inbound payload for an UNMAPPED phone_number_id writes zero
//         msg_message rows, returns 200, and produces exactly one unrouted record
//         + exactly one alert;
//   (ii)  two MAPPED identities in one delivery route to two different tenants;
//   (iii) MESSAGING_DEFAULT_TENANT_ID is gone from src/ — and setting it (plus a
//         single tenant row) cannot resurrect the old default;
//   (iv)  telephony verifies a signature or refuses, and its DID routing is the
//         same fail-closed mapping.
// Run: npx tsx tests/wo311_webhook_tenant.ts
import { createHmac } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

let failed = 0;
function check(label: string, cond: boolean, extra?: unknown) {
  if (cond) {
    console.log(`ok  : ${label}`);
  } else {
    failed++;
    console.error(`FAIL: ${label}${extra === undefined ? "" : ` — ${JSON.stringify(extra)}`}`);
  }
}

// ── Fixtures ─────────────────────────────────────────────────────────────────
const SUPABASE_URL = "https://stub.supabase.test";
const ALERT_URL = "https://alerts.stub.test/forwarder";
const APP_SECRET = "wa-app-secret";
const TELEPHONY_SECRET = "telephony-shared-secret";

const TENANT_A = "11111111-1111-1111-1111-111111111111";
const TENANT_B = "22222222-2222-2222-2222-222222222222";
const TENANT_C = "33333333-3333-3333-3333-333333333333";

const WABA_A = "1099999900001"; // Meta phone_number_id for firm A
const WABA_B = "1099999900002"; // …firm B
const WABA_UNMAPPED = "1099999900099";
const DID_C = "+919876500000";

const SENDER_A = "919812300001"; // a CLIENT's number — PII, never a routing key
const SENDER_B = "919812300002";

// ── PostgREST + forwarder stub ───────────────────────────────────────────────
interface Call {
  method: string;
  table: string;
  url: string;
  body: unknown;
}
let calls: Call[] = [];
const mappings = new Map<string, { tenant_id: string; active: boolean }>();
let identityLookupFails = false;

const jsonRes = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

const countOf = (table: string, method?: string) =>
  calls.filter((c) => c.table === table && (!method || c.method === method)).length;
const bodiesOf = (table: string, method: string) =>
  calls.filter((c) => c.table === table && c.method === method).map((c) => c.body);

function installFetchStub() {
  globalThis.fetch = (async (input: unknown, init?: { method?: string; body?: unknown }) => {
    const url =
      typeof input === "string" ? input : ((input as { url?: string })?.url ?? String(input));
    const method = (init?.method ?? "GET").toUpperCase();
    let body: unknown = null;
    if (init?.body) {
      try {
        body = JSON.parse(String(init.body));
      } catch {
        body = String(init.body);
      }
    }

    if (url.startsWith(ALERT_URL)) {
      calls.push({ method, table: "__alert__", url, body });
      return jsonRes({ ok: true });
    }

    const m = /\/rest\/v1\/([a-z_]+)/.exec(url);
    const table = m ? m[1] : "__unknown__";
    calls.push({ method, table, url, body });

    if (table === "messaging_identity" && method === "GET") {
      if (identityLookupFails) {
        // What the PRE-APPLY schema actually returns (the migration ships inert).
        return jsonRes({ message: 'relation "public.messaging_identity" does not exist', code: "42P01" }, 404);
      }
      const q = new URL(url).searchParams;
      const eq = (k: string) => (q.get(k) ?? "").replace(/^eq\./, "");
      const row = mappings.get(`${eq("channel")}:${eq("identity")}`);
      if (!row) return jsonRes([]);
      if (eq("active") === "true" && !row.active) return jsonRes([]);
      return jsonRes([{ tenant_id: row.tenant_id }]);
    }
    if (table === "msg_message" && method === "POST") return jsonRes([{ id: `msg-${calls.length}` }], 201);
    return jsonRes([], method === "GET" ? 200 : 201);
  }) as unknown as typeof fetch;
}

function reset() {
  calls = [];
  identityLookupFails = false;
}

// A Meta-shaped inbound payload. `entries` = one per receiving WABA number.
function metaPayload(entries: { phoneNumberId?: string; from: string; id: string }[]) {
  return {
    object: "whatsapp_business_account",
    entry: entries.map((e, i) => ({
      id: `entry-${i}`,
      changes: [
        {
          field: "messages",
          value: {
            messaging_product: "whatsapp",
            ...(e.phoneNumberId
              ? { metadata: { display_phone_number: "+91 98765 00000", phone_number_id: e.phoneNumberId } }
              : { metadata: {} }),
            messages: [
              {
                id: e.id,
                from: e.from,
                timestamp: "1753900000",
                type: "image", // media-only ⇒ empty body ⇒ no LLM call ⇒ stays offline
                image: { id: `media-${e.id}`, mime_type: "image/jpeg" },
              },
            ],
          },
        },
      ],
    })),
  };
}

const sign = (secret: string, raw: string, prefix = "sha256=") =>
  prefix + createHmac("sha256", secret).update(raw, "utf8").digest("hex");

async function main() {
  // ── (A) The env default and the sole-tenant heuristic are GONE from src/ ────
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
      d.isDirectory() ? walk(join(dir, d.name)) : [join(dir, d.name)],
    );
  const srcFiles = walk("src");
  const offenders = srcFiles.filter((f) => readFileSync(f, "utf8").includes("MESSAGING_DEFAULT_TENANT_ID"));
  check("MESSAGING_DEFAULT_TENANT_ID no longer exists anywhere in src/", offenders.length === 0, offenders);

  const waRoute = readFileSync("src/app/api/messaging/whatsapp/route.ts", "utf8");
  check("whatsapp route no longer reads the `tenant` table (sole-tenant heuristic deleted)", !waRoute.includes('from("tenant")'));
  check("whatsapp route routes via the mapping seam", waRoute.includes("resolveTenantByIdentity("));
  const teleRoute = readFileSync("src/app/api/voice/telephony/route.ts", "utf8");
  check("telephony route routes via the mapping seam", teleRoute.includes("resolveTenantByIdentity("));
  check("telephony route verifies a signature", teleRoute.includes("verifyTelephonySignature("));

  // ── (B) Migration posture (the table ships INERT; assert its shape) ─────────
  const migFile = readdirSync("supabase/migrations").find((f) => f.includes("wo311_messaging_identity"));
  check("WO-311 migration exists", Boolean(migFile), migFile);
  const mig = readFileSync(join("supabase/migrations", migFile ?? ""), "utf8");
  check("mapping table is tenant-owned (tenant_id not null, FK to tenant)", /tenant_id\s+uuid not null references tenant/.test(mig));
  check("one tenant per receiving identity (unique index on channel+identity)", /create unique index[\s\S]*?on messaging_identity \(channel, identity\)/.test(mig));
  check("RLS is enabled on the mapping table", /enable row level security/.test(mig));
  check("owning tenant may SELECT its own mapping (keyed on current_tenant_id())", /create policy %1\$s_select[\s\S]*?tenant_id = current_tenant_id\(\)/.test(mig));
  check(
    "NO tenant write policy — provisioning is service-role only (no routing-hijack primitive)",
    !/_insert on|_update on|_delete on/.test(mig.replace(/--[^\n]*/g, "")),
  );

  // ── Seam-level: resolution is fail-closed on every miss ─────────────────────
  process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-stub";
  process.env.OPS_ALERT_WEBHOOK_URL = ALERT_URL;
  installFetchStub();

  const { createAdminClient } = await import("@/lib/supabase/admin");
  const { resolveTenantByIdentity, normalizeIdentity, recordUnroutedInbound } = await import(
    "@/lib/services/messaging/identity"
  );
  const admin = createAdminClient();

  mappings.set(`whatsapp:${WABA_A}`, { tenant_id: TENANT_A, active: true });
  mappings.set(`whatsapp:${WABA_B}`, { tenant_id: TENANT_B, active: true });
  mappings.set(`telephony:${DID_C}`, { tenant_id: TENANT_C, active: true });
  mappings.set("whatsapp:1099999900003", { tenant_id: TENANT_A, active: false });
  // The SENDER's number is mapped too — if anything ever routed on the sender,
  // this fixture would hand it a tenant and the negative check below would fail.
  mappings.set(`whatsapp:${SENDER_A}`, { tenant_id: TENANT_B, active: true });

  check("identity normalisation: WhatsApp phone_number_id is kept verbatim", normalizeIdentity("whatsapp", " 1099 ") === "1099");
  check("identity normalisation: a telephony DID becomes E.164", normalizeIdentity("telephony", "919876500000") === DID_C);
  check("identity normalisation: empty → null (fail closed)", normalizeIdentity("whatsapp", "  ") === null);

  reset();
  const rA = await resolveTenantByIdentity(admin, "whatsapp", WABA_A);
  const rB = await resolveTenantByIdentity(admin, "whatsapp", WABA_B);
  check("mapped identity A → tenant A", rA.tenantId === TENANT_A && rA.reason === "mapped", rA);
  check("mapped identity B → tenant B (a second firm is now safe)", rB.tenantId === TENANT_B && rB.reason === "mapped", rB);
  check("two mapped identities resolve to DIFFERENT tenants", rA.tenantId !== rB.tenantId);

  const rMiss = await resolveTenantByIdentity(admin, "whatsapp", WABA_UNMAPPED);
  check("unmapped identity → null, reason 'unmapped'", rMiss.tenantId === null && rMiss.reason === "unmapped", rMiss);
  const rNone = await resolveTenantByIdentity(admin, "whatsapp", undefined);
  check("absent identity → null, reason 'no_identity'", rNone.tenantId === null && rNone.reason === "no_identity", rNone);
  const rInactive = await resolveTenantByIdentity(admin, "whatsapp", "1099999900003");
  check("deactivated mapping → null (deactivate = fail closed again)", rInactive.tenantId === null, rInactive);

  identityLookupFails = true;
  const rErr = await resolveTenantByIdentity(admin, "whatsapp", WABA_A);
  check("pre-apply / DB error → null, reason 'lookup_failed' (never a guess)", rErr.tenantId === null && rErr.reason === "lookup_failed", rErr);
  identityLookupFails = false;

  // ── (i) Unmapped receiving identity: zero rows, 200, one record, one alert ──
  process.env.MESSAGING_PROVIDER = "whatsapp_bsp";
  process.env.WHATSAPP_BSP_API_KEY = "bsp-key";
  process.env.WHATSAPP_BSP_BASE_URL = "https://bsp.stub.test/v1";
  process.env.WHATSAPP_BSP_PHONE_NUMBER_ID = WABA_A; // OUR configured number ≠ the payload's
  process.env.WHATSAPP_APP_SECRET = APP_SECRET;
  delete process.env.DEMO_MODE;

  const { NextRequest } = await import("next/server");
  const { POST: whatsappPOST } = await import("@/app/api/messaging/whatsapp/route");

  const post = async (payload: unknown, opts?: { secret?: string; signature?: string }) => {
    const raw = JSON.stringify(payload);
    const headers: Record<string, string> = { "content-type": "application/json" };
    const sig = opts?.signature ?? sign(opts?.secret ?? APP_SECRET, raw);
    if (sig) headers["x-hub-signature-256"] = sig;
    return whatsappPOST(
      new NextRequest("https://app.mukadma.in/api/messaging/whatsapp", { method: "POST", body: raw, headers }),
    );
  };

  reset();
  const resUnmapped = await post(metaPayload([{ phoneNumberId: WABA_UNMAPPED, from: SENDER_A, id: "wamid.unmapped" }]));
  const bodyUnmapped = (await resUnmapped.json()) as Record<string, unknown>;
  check("(i) unmapped identity → HTTP 200 (the provider stops retrying)", resUnmapped.status === 200, resUnmapped.status);
  check("(i) ZERO msg_message rows written", countOf("msg_message", "POST") === 0, calls.map((c) => `${c.method} ${c.table}`));
  check("(i) exactly ONE unrouted record", countOf("court_provider_health", "POST") === 1);
  check("(i) exactly ONE alert", countOf("__alert__") === 1);
  check("(i) response is honest about the refusal", bodyUnmapped.skipped === "no_tenant_mapping" && bodyUnmapped.refused === 1, bodyUnmapped);

  const healthBody = bodiesOf("court_provider_health", "POST")[0] as Record<string, unknown>;
  const healthRow = (Array.isArray(healthBody) ? healthBody[0] : healthBody) as Record<string, unknown>;
  check("(i) unrouted record is a not-ok health row on the messaging-inbound key", healthRow.provider === "messaging-inbound" && healthRow.ok === false, healthRow);
  check("(i) the record names the identity that needs seeding", String(healthRow.last_error).includes(WABA_UNMAPPED), healthRow.last_error);
  const alertBody = bodiesOf("__alert__", "POST")[0] as Record<string, unknown>;
  check("(i) alert is critical and names the identity", alertBody.severity === "critical" && JSON.stringify(alertBody).includes(WABA_UNMAPPED), alertBody);
  check("(i) NO PII: the client's number never leaves the request", !JSON.stringify(calls.filter((c) => c.table === "__alert__" || c.table === "court_provider_health")).includes(SENDER_A));

  // ── (ii) Two mapped identities in ONE delivery → two different tenants ──────
  reset();
  const resTwo = await post(
    metaPayload([
      { phoneNumberId: WABA_A, from: SENDER_A, id: "wamid.a" },
      { phoneNumberId: WABA_B, from: SENDER_B, id: "wamid.b" },
    ]),
  );
  const msgInserts = bodiesOf("msg_message", "POST").map((b) => (Array.isArray(b) ? b[0] : b)) as Record<string, unknown>[];
  check("(ii) HTTP 200", resTwo.status === 200);
  check("(ii) both messages were stored", msgInserts.length === 2, msgInserts.length);
  const byExternal = new Map(msgInserts.map((r) => [String(r.external_id), String(r.tenant_id)]));
  check("(ii) firm A's message is filed under tenant A", byExternal.get("wamid.a") === TENANT_A, byExternal.get("wamid.a"));
  check("(ii) firm B's message is filed under tenant B", byExternal.get("wamid.b") === TENANT_B, byExternal.get("wamid.b"));
  check("(ii) the two messages landed in DIFFERENT tenants", byExternal.get("wamid.a") !== byExternal.get("wamid.b"));
  check("(ii) no unrouted record and no alert on a fully routed delivery", countOf("__alert__") === 0);
  const tenantScoped = calls.filter((c) => ["client", "matter"].includes(c.table) && c.method === "GET");
  check(
    "(ii) every shortlist read is tenant-scoped (service-role scoping by hand)",
    tenantScoped.length > 0 && tenantScoped.every((c) => /tenant_id=eq\.(11111111|22222222)/.test(c.url)),
  );

  // ── (iii) The deleted default cannot be resurrected by env ──────────────────
  reset();
  process.env.MESSAGING_DEFAULT_TENANT_ID = TENANT_A; // the bug's old lever
  const resDefault = await post(metaPayload([{ phoneNumberId: WABA_UNMAPPED, from: SENDER_A, id: "wamid.def" }]));
  check("(iii) setting MESSAGING_DEFAULT_TENANT_ID changes NOTHING — still refused", resDefault.status === 200 && countOf("msg_message", "POST") === 0);
  check("(iii) the `tenant` table is never consulted to guess an owner", countOf("tenant") === 0);
  delete process.env.MESSAGING_DEFAULT_TENANT_ID;

  // ── A payload with no metadata cannot fall back to OUR configured number ────
  reset();
  const resNoMeta = await post(metaPayload([{ from: SENDER_A, id: "wamid.nometa" }]));
  check("no phone_number_id in the payload → refused, zero rows", resNoMeta.status === 200 && countOf("msg_message", "POST") === 0);
  check("no phone_number_id → still exactly one record + one alert", countOf("court_provider_health", "POST") === 1 && countOf("__alert__") === 1);

  // ── The WhatsApp HMAC still gates everything ────────────────────────────────
  reset();
  const resBadSig = await post(metaPayload([{ phoneNumberId: WABA_A, from: SENDER_A, id: "wamid.bad" }]), { secret: "wrong-secret" });
  check("forged signature → 401, nothing written", resBadSig.status === 401 && calls.length === 0);

  reset();
  const savedAppSecret = process.env.WHATSAPP_APP_SECRET;
  delete process.env.WHATSAPP_APP_SECRET;
  const resNoSecret = await post(metaPayload([{ phoneNumberId: WABA_A, from: SENDER_A, id: "wamid.nosec" }]));
  check("live provider with NO app secret → 503 refusal, nothing written", resNoSecret.status === 503 && calls.length === 0);
  process.env.WHATSAPP_APP_SECRET = savedAppSecret;

  // ── (iv) Telephony: verify or refuse, then the same mapping rule ────────────
  const { verifyTelephonySignature, parseTelephonyBody } = await import("@/lib/services/messaging/telephony");
  check("verifier: no secret configured → refuse (never open)", verifyTelephonySignature("x", "sha256=abc", undefined).reason === "no_secret");
  check("verifier: secret set, no signature header → refuse", verifyTelephonySignature("x", null, TELEPHONY_SECRET).reason === "missing_signature");
  check("verifier: wrong signature → refuse", verifyTelephonySignature("x", sign(TELEPHONY_SECRET, "y"), TELEPHONY_SECRET).reason === "bad_signature");
  check("verifier: correct signature → ok (sha256= prefix)", verifyTelephonySignature("x", sign(TELEPHONY_SECRET, "x"), TELEPHONY_SECRET).ok);
  check("verifier: correct signature → ok (bare hex)", verifyTelephonySignature("x", sign(TELEPHONY_SECRET, "x", ""), TELEPHONY_SECRET).ok);
  check("body parse: urlencoded", parseTelephonyBody("To=123&From=456", "application/x-www-form-urlencoded").To === "123");
  check("body parse: json", (parseTelephonyBody('{"To":"123"}', "application/json") as { To?: string }).To === "123");

  const { POST: telephonyPOST } = await import("@/app/api/voice/telephony/route");
  const postTele = async (raw: string, opts?: { signature?: string | null }) => {
    const headers: Record<string, string> = { "content-type": "application/x-www-form-urlencoded" };
    const sig = opts && "signature" in opts ? opts.signature : sign(TELEPHONY_SECRET, raw);
    if (sig) headers["x-telephony-signature"] = sig;
    return telephonyPOST(
      new NextRequest("https://app.mukadma.in/api/voice/telephony", { method: "POST", body: raw, headers }),
    );
  };

  reset();
  delete process.env.TELEPHONY_PROVIDER;
  const resInert = await telephonyPOST(
    new NextRequest("https://app.mukadma.in/api/voice/telephony", { method: "POST", body: "To=1" }),
  );
  check("(iv) no provider configured → inert 200, nothing written", resInert.status === 200 && calls.length === 0);

  process.env.TELEPHONY_PROVIDER = "exotel";
  delete process.env.TELEPHONY_WEBHOOK_SECRET;
  reset();
  const resNoVerifier = await postTele("To=919876500000&From=919812300001&CallSid=c1", { signature: null });
  check("(iv) provider set but no verifier → 503 hard refusal", resNoVerifier.status === 503, resNoVerifier.status);
  check("(iv) refusal writes NO voice_recording row", countOf("voice_recording", "POST") === 0);
  check("(iv) refusal is durably recorded on the telephony health key", countOf("court_provider_health", "POST") === 1);

  process.env.TELEPHONY_WEBHOOK_SECRET = TELEPHONY_SECRET;
  reset();
  const resTeleBad = await postTele("To=919876500000&From=919812300001&CallSid=c2", { signature: "sha256=deadbeef" });
  check("(iv) bad signature → 401, nothing written", resTeleBad.status === 401 && calls.length === 0);

  reset();
  const resTeleUnmapped = await postTele("To=919999999999&From=919812300001&CallSid=c3");
  check("(iv) verified but UNMAPPED DID → 200, zero voice_recording rows", resTeleUnmapped.status === 200 && countOf("voice_recording", "POST") === 0);
  check("(iv) unmapped DID → exactly one record + one alert", countOf("court_provider_health", "POST") === 1 && countOf("__alert__") === 1);

  reset();
  const resTeleOk = await postTele("To=919876500000&From=919812300001&CallSid=c4&RecordingDuration=42");
  const vr = bodiesOf("voice_recording", "POST").map((b) => (Array.isArray(b) ? b[0] : b))[0] as Record<string, unknown>;
  check("(iv) verified + MAPPED DID → stored under the mapped tenant", resTeleOk.status === 200 && vr?.tenant_id === TENANT_C, vr);
  check("(iv) a routed call raises no alert", countOf("__alert__") === 0);

  // ── The alert seam itself degrades honestly ────────────────────────────────
  reset();
  delete process.env.OPS_ALERT_WEBHOOK_URL;
  const unrouted = await recordUnroutedInbound(admin, {
    channel: "whatsapp",
    identity: WABA_UNMAPPED,
    reason: "unmapped",
    messages: 1,
  });
  check("alert seam: unset forwarder URL → 'unconfigured', never a throw", unrouted.alert.outcome === "unconfigured", unrouted.alert);
  check("alert seam: the durable record still lands without the forwarder", countOf("court_provider_health", "POST") === 1);
  process.env.OPS_ALERT_WEBHOOK_URL = ALERT_URL;

  reset();
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: unknown, init?: { method?: string; body?: unknown }) => {
    const url = typeof input === "string" ? input : ((input as { url?: string })?.url ?? String(input));
    if (url.startsWith(ALERT_URL)) throw new Error("forwarder unreachable");
    return (realFetch as unknown as (i: unknown, o?: unknown) => Promise<Response>)(input, init);
  }) as unknown as typeof fetch;
  const degraded = await recordUnroutedInbound(admin, {
    channel: "whatsapp",
    identity: WABA_UNMAPPED,
    reason: "unmapped",
    messages: 1,
  });
  check("alert seam: a dead forwarder degrades to 'failed', never a throw", degraded.alert.outcome === "failed", degraded.alert);
  check("alert seam: the durable record still lands when the forwarder is dead", degraded.recorded === true);
  globalThis.fetch = realFetch;

  console.log(`\n==== WO-311 webhook tenancy: ${failed === 0 ? "PASS" : `${failed} FAILURE(S)`} ====`);
  if (failed) process.exit(1);
}

main().catch((e) => {
  console.error("WO-311 TEST ERROR:", e);
  process.exit(1);
});
