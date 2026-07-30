// WO-311 · The ONE outbound path for a critical runtime alert from the app.
//
// Alerting posture (founder 2026-07-22, NOW.md): every critical alert in the
// estate lands in ONE place — the "Critical AWS Alerts" Google Chat space — via
// the shared alarm-forwarder Lambda (SNS topic → forwarder → Chat), which reads
// the Chat webhook out of Secrets Manager at runtime. Nothing in this repo ever
// holds the Chat webhook URL: `OPS_ALERT_WEBHOOK_URL` is the forwarder's own
// HTTPS ingress, supplied as a Vercel env var, and a wrong/unset value can only
// cost us the alert — never a message, never a tenant row.
//
// Before this, the app had NO alert path at all: WO-63/WO-286/WO-288 all had to
// settle for a `court_provider_health` dead-man row and said so in-line ("W2
// wires a real GChat/SNS alarm; no webhook URL exists in-repo"). WO-311 needs a
// real one, because a mis-routed client message is exactly the failure that must
// not sit silent — silence is how the webhook tenant-guess bug hid for months.
//
// Contract:
//   * NEVER throws. An alert failing must not fail the caller's request.
//   * NEVER carries PII. No message bodies, no client phone numbers, no emails.
//     Business identities (a firm's own WABA id / DID) are fine; senders are not.
//   * Bounded: one POST, one short timeout, no retries (the caller's durable
//     record — a health row or a ledger — is the retry-free source of truth).

export type OpsAlertOutcome = "delivered" | "unconfigured" | "failed";

export interface OpsAlert {
  /** Stable key for the alarm source, e.g. "messaging-inbound". */
  source: string;
  severity: "critical" | "warning";
  /** One line, PII-free, human-readable in the Chat space. */
  summary: string;
  /** Flat, PII-free diagnostic key/values. */
  detail?: Record<string, string | number | boolean | null>;
}

export interface OpsAlertResult {
  outcome: OpsAlertOutcome;
  /** Short, PII-free reason — safe to store in a health row. */
  detail: string;
}

/** Bounded so a hung forwarder can never eat a webhook's runtime budget. */
export const OPS_ALERT_TIMEOUT_MS = 5000;

export async function sendOpsAlert(alert: OpsAlert): Promise<OpsAlertResult> {
  const url = process.env.OPS_ALERT_WEBHOOK_URL;
  if (!url) {
    // Fail LOUD in the log rather than silently swallowing the signal: the
    // caller still writes its durable record, but somebody must notice that the
    // estate's alert path is unwired in this environment.
    console.error(`[ops-alert] OPS_ALERT_WEBHOOK_URL unset — alert not delivered: ${alert.source}: ${alert.summary}`);
    return { outcome: "unconfigured", detail: "OPS_ALERT_WEBHOOK_URL unset" };
  }

  const body = JSON.stringify({
    source: alert.source,
    severity: alert.severity,
    summary: alert.summary,
    detail: alert.detail ?? {},
    app: "legaldriver",
    env: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "unknown",
    at: new Date().toISOString(),
  });

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(OPS_ALERT_TIMEOUT_MS),
    });
    if (!res.ok) {
      console.error(`[ops-alert] forwarder HTTP ${res.status} for ${alert.source}`);
      return { outcome: "failed", detail: `forwarder HTTP ${res.status}` };
    }
    return { outcome: "delivered", detail: "delivered" };
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    console.error(`[ops-alert] forwarder POST failed for ${alert.source}: ${reason}`);
    return { outcome: "failed", detail: `forwarder POST failed: ${reason}` };
  }
}
