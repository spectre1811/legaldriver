#!/usr/bin/env node
// WO-358 W2 — end-to-end delivery-latency probe. THE acceptance measurement.
//
// Inserts one real notification row and measures the wall time until the pipeline flips it to
// 'sent'. That covers the whole chain: insert commit → trigger pg_notify → listener wake →
// /api/cron/notify → pipeline → status flip. Nothing is simulated.
//
//   listener running  → expect < 5s   (WO-358 W2 acceptance)
//   listener stopped  → expect ≤ 5min (the WO-355 cron backstop; run with --timeout 330)
//
// The probe row is channel=inapp so nothing is emailed or messaged to a human, and it is
// deleted again on the way out.
//
// Usage:
//   NOTIFY_PG_URL='postgres://…:5432/postgres?sslmode=require' \
//     node scripts/notify-listener-verify.mjs --tenant <uuid> [--user <uuid>] [--timeout 5]
//
// Needs the `pg` package (present in the listener's install dir on the web box:
// `node --experimental-default-type=module` not required; run it from /opt/web/ld-notify-listener).

const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i].replace(/^--/, ""), process.argv[i + 1]);

const dsn = process.env.NOTIFY_PG_URL;
const tenant = args.get("tenant");
const user = args.get("user") ?? null;
const timeoutMs = Number(args.get("timeout") ?? 5) * 1000;

if (!dsn || !tenant) {
  console.error("usage: NOTIFY_PG_URL=… node scripts/notify-listener-verify.mjs --tenant <uuid> [--user <uuid>] [--timeout <seconds>]");
  process.exit(2);
}

const { default: pg } = await import("pg");
const client = new pg.Client({ connectionString: dsn, application_name: "ld-notify-verify" });
await client.connect();

const { rows: trig } = await client.query(
  "select tgname, tgenabled from pg_trigger where tgrelid = 'public.notification'::regclass and tgname = 'notification_wake'",
);
if (!trig.length) {
  console.error("✗ trigger notification_wake is ABSENT — migration 20260811120000 not applied; nothing can wake the listener");
  await client.end();
  process.exit(1);
}
console.log(`trigger notification_wake present (tgenabled=${trig[0].tgenabled})`);

const { rows: ins } = await client.query(
  `insert into notification (tenant_id, user_id, channel, kind, status, scheduled_for, payload)
   values ($1, $2, 'inapp', 'wake_probe', 'pending', now(), $3::jsonb)
   returning id`,
  [tenant, user, JSON.stringify({ title: "delivery-latency probe", body: "WO-358 W2 verification" })],
);
const id = ins[0].id;
const t0 = Date.now(); // the INSERT has committed by the time this statement returns
console.log(`seeded notification ${id} — waiting up to ${timeoutMs / 1000}s for the pipeline to flip it`);

let elapsed = -1;
while (Date.now() - t0 < timeoutMs) {
  const { rows } = await client.query("select status from notification where id = $1", [id]);
  if (rows[0]?.status === "sent") {
    elapsed = Date.now() - t0;
    break;
  }
  await new Promise((r) => setTimeout(r, 100));
}

await client.query("delete from notification where id = $1", [id]);
await client.end();

if (elapsed < 0) {
  console.error(`✗ NOT delivered within ${timeoutMs / 1000}s — listener down or not woken (check: journalctl -u ld-notify-listener)`);
  process.exit(1);
}
console.log(`✓ delivered in ${elapsed}ms (insert commit → status='sent')`);
