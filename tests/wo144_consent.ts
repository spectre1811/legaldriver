// WO-144 W2: consent seam self-check. Deterministic, offline, no secrets — the
// supabase client is a minimal chainable stub over an in-memory row array, so
// this proves the seam's logic without the (founder-gated, unapplied) migration.
// Run: npx tsx tests/wo144_consent.ts
import {
  isStopMessage,
  checkConsent,
  recordConsent,
  recordOptOut,
  canSendWhatsApp,
} from "@/lib/services/messaging/consent";

let failed = 0;
function eq(label: string, got: unknown, want: unknown) {
  if (got !== want) {
    failed++;
    console.error(`✗ ${label}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);
  }
}

// ── isStopMessage matrix ──────────────────────────────────────────────────────
eq("stop", isStopMessage("stop"), true);
eq("STOP", isStopMessage("STOP"), true);
eq("Stop!", isStopMessage("Stop!"), true);
eq("stop.", isStopMessage("stop."), true);
eq("unsubscribe", isStopMessage("unsubscribe"), true);
eq("Unsubscribe!", isStopMessage("Unsubscribe!"), true);
eq("padded ' stop '", isStopMessage(" stop "), true);
eq("negative: please stop calling", isStopMessage("please stop calling"), false);
eq("negative: stop it", isStopMessage("stop it"), false);
eq("negative: stopp", isStopMessage("stopp"), false);
eq("negative: empty", isStopMessage(""), false);
eq("negative: null", isStopMessage(null), false);
eq("negative: undefined", isStopMessage(undefined), false);

// ── Minimal chainable supabase stub over an in-memory consent_ledger ─────────
type Row = Record<string, unknown>;
function makeDb() {
  const rows: Row[] = [];
  let seq = 0;
  function from(table: string) {
    if (table !== "consent_ledger") throw new Error(`unexpected table: ${table}`);
    const filters: ((r: Row) => boolean)[] = [];
    let op: "select" | "update" = "select";
    let patch: Row = {};
    const matches = () => rows.filter((r) => filters.every((f) => f(r)));
    const b: any = {
      select: () => b,
      insert: (vals: Row) => {
        rows.push({ id: String(++seq), opt_out_at: null, ...vals });
        return Promise.resolve({ data: null, error: null });
      },
      update: (p: Row) => ((op = "update"), (patch = p), b),
      eq: (col: string, val: unknown) => (filters.push((r) => r[col] === val), b),
      is: (col: string, val: unknown) => (filters.push((r) => r[col] === val), b),
      limit: () => b,
      maybeSingle: () => Promise.resolve({ data: matches()[0] ?? null, error: null }),
      // Awaiting the bare builder resolves the pending op (supabase builders are thenables).
      then: (resolve: (v: unknown) => void) => {
        if (op === "update") for (const r of matches()) Object.assign(r, patch);
        resolve({ data: null, error: null });
      },
    };
    return b;
  }
  return { db: { from } as any, rows };
}

async function main() {
  const { db, rows } = makeDb();
  const num = "+919876543210";

  // No grant yet → no consent, no send.
  eq("checkConsent: none", await checkConsent(db, num, "service"), false);
  eq("canSendWhatsApp: no grant", await canSendWhatsApp(db, num), false);

  // Grant 'service' → consented + sendable.
  await recordConsent(db, { tenantId: "t1", number: num, purpose: "service", source: "settings/notifications" });
  eq("checkConsent: open grant", await checkConsent(db, num, "service"), true);
  eq("canSendWhatsApp: open grant", await canSendWhatsApp(db, num), true);
  eq("grant row written", rows.length, 1);
  eq("wording_version default", rows[0].wording_version, "v1");

  // Dedupe: a second grant for the same (number, purpose) is a no-op.
  await recordConsent(db, { tenantId: "t1", number: num, purpose: "service", source: "settings/notifications" });
  eq("recordConsent dedupe: still one row", rows.length, 1);

  // A different purpose is a separate grant.
  await recordConsent(db, { tenantId: "t1", number: num, purpose: "marketing", source: "campaign/x" });
  eq("second purpose: two rows", rows.length, 2);
  eq("checkConsent: marketing open", await checkConsent(db, num, "marketing"), true);

  // STOP closes ALL purposes, globally + instantly.
  await recordOptOut(db, num);
  eq("post-STOP: service closed", await checkConsent(db, num, "service"), false);
  eq("post-STOP: marketing closed", await checkConsent(db, num, "marketing"), false);
  eq("post-STOP: cannot send", await canSendWhatsApp(db, num), false);
  eq("post-STOP: rows kept (append-only)", rows.length, 2);
  eq("post-STOP: all rows stamped", rows.every((r) => r.opt_out_at !== null), true);

  // Re-grant after STOP opens a NEW row (the closed one is never reopened).
  await recordConsent(db, { tenantId: "t1", number: num, purpose: "service", source: "settings/notifications" });
  eq("re-grant: new row appended", rows.length, 3);
  eq("re-grant: sendable again", await canSendWhatsApp(db, num), true);

  // Another number is independent — never sendable without its own grant.
  eq("other number: cannot send", await canSendWhatsApp(db, "+919999999999"), false);

  if (failed) {
    console.error(`\n${failed} assertion(s) failed`);
    process.exit(1);
  }
  console.log("wo144_consent: all assertions passed");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
