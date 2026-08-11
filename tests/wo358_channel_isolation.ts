// Test: channel-isolation — a throw in one channel never blocks another (WO-358 W1).
// Run: npx tsx tests/wo358_channel_isolation.ts
//
// Post-refactor: each channel deliver module wraps its work in try/catch.
// An email failure is logged + counted, but WhatsApp and in-app rows in the
// same run still deliver. This test PASSES.
//
// The deletion experiment (Manager Direction #2): remove the try/catch from the
// refactored deliver modules — this test FAILS again, proving the monolith was
// incapable of channel isolation.

import { runPipeline } from "@/lib/notify/pipeline";
import type { Mailer, SendResult } from "@/lib/notify/mailer";
import { setMessagingClient } from "@/lib/services/messaging/client";
import type { MessagingClient } from "@/lib/services/messaging/client";
import type { OutboundMessage, InboundMessage } from "@/lib/services/messaging/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/database.types";

let ok = true;
const check = (name: string, cond: boolean) => {
  if (!cond) ok = false;
  console.log(`${cond ? "ok  " : "FAIL"}: ${name}`);
};

// --- Mock DB helpers ---
type AnyChain = Record<string, unknown> & { [key: string]: unknown };

// mk: creates a chainable mock node. `limit` returns `self` so further chaining
// (`.maybeSingle()`) works. Override specific methods via `overrides`.
function mk(overrides?: Record<string, unknown>): AnyChain {
  const self: AnyChain = {};
  self.eq = () => self;
  self.neq = () => self;
  self.in = () => self;
  self.is = () => self;
  self.lt = () => self;
  self.lte = () => self;
  self.gt = () => self;
  self.gte = () => self;
  self.contains = () => self;
  self.order = () => self;
  self.select = () => self;
  self.update = () => self;
  self.insert = async () => ({ error: null });
  self.limit = () => self;
  self.maybeSingle = async () => ({ data: null, error: null });
  self.upsert = async () => ({ error: null });
  self.then = (resolve: (v: unknown) => void) => resolve({ data: null, error: null });
  if (overrides) Object.assign(self, overrides);
  return self;
}

// --- Mutation tracking ---
const mutations: { table: string; id?: string; status?: string; to?: string; provider?: string; ok?: boolean }[] = [];

// --- Mock MessagingClient ---
class MockMsgClient implements MessagingClient {
  readonly provider = "mock-test";
  sendCalls = 0;
  async send(_msg: OutboundMessage): Promise<{ status: "sent" | "queued" | "failed"; error?: string }> {
    this.sendCalls++;
    return { status: "sent" };
  }
  normalizeInbound(_payload: unknown): InboundMessage[] { return []; }
}

// --- ThrowingMailer ---
class ThrowingMailer implements Mailer {
  readonly channel = "email" as const;
  sendCalls = 0;
  async send(_to: string, _subject: string, _html: string, _text?: string): Promise<SendResult> {
    this.sendCalls++;
    throw new Error("simulated email provider down");
  }
}

// --- Build mock Supabase DB ---
function mockDB(pendingRows: Record<string, unknown>[]) {
  const updated = new Map<string, { status: string; sent_at?: string | null }>();

  return {
    from: (table: string) => {
      // notification: handles pickup, update, and flip queries
      if (table === "notification") {
        let cols = "";
        let eqCol = "";
        let eqVal = "";
        let idVal = ""; // survives eq("id", v) then eq("status", ...)
        let idVals: string[] = []; // survives in("id", [...]) then in("status", [...])
        let inCol = "";
        let inVals: string[] = [];
        let setVals: Record<string, unknown> = {};
        let op = ""; // "select" or "update"

        const n = mk();
        n.select = (c: string) => { cols = c; op = "select"; return n; };
        n.eq = (c: string, v: string) => { eqCol = c; eqVal = String(v); if (c === "id") idVal = String(v); return n; };
        n.lt = (c: string, v: number) => { eqCol = c; eqVal = String(v); return n; };
        n.in = (c: string, v: string[]) => { inCol = c; inVals = v; if (c === "id") idVals = v; return n; };
        n.update = (vals: Record<string, unknown>) => { op = "update"; setVals = vals; return n; };
        n.limit = async () => {
          if (op === "select") {
            if (cols.includes("attempts") || eqVal === "failed") return { data: [], error: null };
            return { data: pendingRows, error: null };
          }
          if (op === "update") {
            const doUpdate = (id: string) => {
              updated.set(id, { status: setVals.status as string, sent_at: setVals.sent_at as string | null });
              mutations.push({ table: "notification", id, status: setVals.status as string });
            };
            if (idVals.length > 0) {
              for (const id of idVals) doUpdate(id);
              return { error: null };
            }
            const targetId = idVal || (eqCol === "id" ? eqVal : "");
            if (targetId) { doUpdate(targetId); return { error: null }; }
            return { error: null };
          }
          return { data: null, error: null };
        };
        // When the chain is awaited directly (no .limit()), e.g.
        // supabase.from(...).update({...}).eq("id", x).eq("status", y)
        // the result must be thenable. Record mutations on resolve.
        n.then = async (resolve: (v: unknown) => void) => {
          if (op === "update") {
            const doUpdate = (id: string) => {
              updated.set(id, { status: setVals.status as string, sent_at: setVals.sent_at as string | null });
              mutations.push({ table: "notification", id, status: setVals.status as string });
            };
            if (idVals.length > 0) { for (const id of idVals) doUpdate(id); }
            else { const targetId = idVal || (eqCol === "id" ? eqVal : ""); if (targetId) doUpdate(targetId); }
            resolve({ error: null });
          } else {
            resolve({ data: null, error: null });
          }
        };
        return n;
      }

      if (table === "matter") {
        return mk({ then: (resolve: (v: unknown) => void) => resolve({ data: [{ id: "m1" }], error: null }) });
      }

      if (table === "outbound_email") {
        return mk({
          insert: async (row: any) => {
            const list = Array.isArray(row) ? row : [row];
            for (const r of list) {
              mutations.push({ table: "outbound_email", to: r.to_addr ?? "?", status: r.status });
            }
            return { error: null };
          },
        });
      }

      if (table === "consent_ledger") {
        // .select("id").eq("number", n).eq("purpose", "service").is("opt_out_at", null).limit(1).maybeSingle()
        // limit returns self, self has maybeSingle → returns consent row
        return mk({ maybeSingle: async () => ({ data: { id: "c1" }, error: null }) });
      }

      if (table === "court_provider_health") {
        return mk({
          upsert: async (row: Record<string, unknown>) => {
            mutations.push({ table: "court_provider_health", provider: (row as any).provider, ok: (row as any).ok });
            return { error: null };
          },
        });
      }

      if (table === "profile") return mk();

      return mk();
    },
    auth: { admin: { getUserById: async () => ({ data: { user: { email: "test@test.com" } }, error: null }) } },
    rpc: async () => ({ data: null, error: null }),
  } as unknown as ReturnType<typeof import("@supabase/supabase-js").createClient<Database>>;
}

const FIXED_NOW = new Date("2026-08-11T10:00:00Z");

const ENV_KEYS = ["MESSAGING_PROVIDER", "WHATSAPP_BSP_API_KEY", "WHATSAPP_BSP_BASE_URL", "WHATSAPP_BSP_PHONE_NUMBER_ID", "NEXT_PUBLIC_APP_URL"] as const;
const saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));

async function main() {
  process.env.MESSAGING_PROVIDER = "whatsapp_bsp";
  process.env.WHATSAPP_BSP_API_KEY = "test-key";
  process.env.WHATSAPP_BSP_BASE_URL = "http://test";
  process.env.WHATSAPP_BSP_PHONE_NUMBER_ID = "test-id";
  process.env.NEXT_PUBLIC_APP_URL = "https://app.mukadma.in";

  const msgClient = new MockMsgClient();
  setMessagingClient(msgClient);

  const mailer = new ThrowingMailer();
  mutations.length = 0;

  const pendingRows = [
    { id: "n-email-1", tenant_id: "t1", user_id: "u1", channel: "email", kind: "case_update",
      payload: { matterId: "m1", title: "Case A", change: "New order", court: "HC", cnr: "CNR1" } },
    { id: "n-wa-1", tenant_id: "t1", user_id: "u1", channel: "whatsapp", kind: "case_update",
      payload: { phone: "9876543210", title: "WhatsApp row", body: "Test body" } },
    { id: "n-inapp-1", tenant_id: "t1", user_id: "u1", channel: "inapp", kind: "case_update",
      payload: { matterId: "m1", title: "InApp row", change: "Bench changed" } },
  ];

  const db = mockDB(pendingRows);
  const { result, error } = await runPipeline(db, mailer, FIXED_NOW);

  const notifMuts = mutations.filter((m) => m.table === "notification");
  const waSent = notifMuts.find((m) => m.id === "n-wa-1" && m.status === "sent");
  const iaSent = notifMuts.find((m) => m.id === "n-inapp-1" && m.status === "sent");

  check("CHANNEL ISOLATION: pipeline did not throw (isolation caught email failure)", !error);
  check("CHANNEL ISOLATION: WhatsApp delivered despite email throw", !!waSent);
  check("CHANNEL ISOLATION: InApp delivered despite email throw", !!iaSent);
  check("CHANNEL ISOLATION: Mailer was called (email attempted)", mailer.sendCalls >= 1);
  check("CHANNEL ISOLATION: pipeline result counts WhatsApp + InApp as sent", result.sent >= 2);
  check("CHANNEL ISOLATION: pipeline result counts email as failed", result.failed >= 1);

  setMessagingClient(null);
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k]!;
  }

  console.log(ok ? "\nWO358 CHANNEL ISOLATION: PASS" : "\nWO358 CHANNEL ISOLATION: FAIL");
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
