// WO-64 · Synthetic canary for the LegalDriver box (the /v1 API the app reads cases from).
//
// The incident: the prod `LD_API_KEY` rotted to a corrupt blob → the box returned 401 → 0 cases for
// EVERY advocate, and NOTHING ever asked the box "does auth still work?", so a 100%-failure state
// produced zero signal for days. This is that missing signal: a scheduled probe that authenticates
// against the box for a KNOWN advocate and turns 401 / empty / unreachable into an ALARM (a
// `court_provider_health` row the diagnostics + fleet health surface reads), instead of silence.
//
// The classification kernel (`evaluateCanary`) is pure + unit-tested offline; `probeLdApi` is the
// thin network shell the cron calls.
import { classifyHttpStatus, type FetchErrorKind } from "./advocate-cases";

// A well-known advocate the warehouse holds a non-empty roster for — the WO's canary target
// (`G/702/2020 → case_count > 0`). Overridable so a different env can pin its own known-good id.
export const CANARY_BAR_ID = process.env.LD_API_CANARY_BAR_ID || "G/702/2020";

export interface CanaryOutcome {
  ok: boolean;
  kind: FetchErrorKind | "empty" | null;   // null = healthy; "empty" = authed but a known roster came back 0
  status: number | null;                   // HTTP status; null if the box was unreachable
  caseCount: number | null;
  detail: string;                           // short, PII-free reason (safe to store in health.last_error)
}

// Pure evaluator — decide health from the probe's raw result. No network, no env → fully testable.
export function evaluateCanary(input: { reachable: boolean; status: number | null; caseCount: number | null }): CanaryOutcome {
  if (!input.reachable || input.status === null) {
    return { ok: false, kind: "source_down", status: null, caseCount: null, detail: "box unreachable (network/timeout)" };
  }
  const kind = classifyHttpStatus(input.status);
  if (kind === "auth") {
    return { ok: false, kind: "auth", status: input.status, caseCount: null, detail: `HTTP ${input.status} — auth rejected (check LD_API_KEY)` };
  }
  if (kind === "source_down" || input.status >= 400) {
    return { ok: false, kind: "source_down", status: input.status, caseCount: null, detail: `HTTP ${input.status} — source error` };
  }
  const n = input.caseCount ?? 0;
  if (n <= 0) {
    // Authenticated (2xx) yet a roster we KNOW is non-empty came back 0 → the key or the box is wrong
    // in a way a 200 hides. This is the subtle failure a bare "is it 200?" check would miss.
    return { ok: false, kind: "empty", status: input.status, caseCount: n, detail: `authed but 0 cases for ${CANARY_BAR_ID} — key or warehouse suspect` };
  }
  return { ok: true, kind: null, status: input.status, caseCount: n, detail: `ok — ${n} cases for ${CANARY_BAR_ID}` };
}

// Extract a case count from the box's `/advocate/{bar_id}` payload (either a `cases[]` array or an
// explicit `case_count`). Kept separate so the network shell stays trivial.
export function caseCountFromPayload(payload: unknown): number {
  const p = payload as { cases?: unknown[]; case_count?: unknown } | null;
  if (Array.isArray(p?.cases)) return p!.cases.length;
  if (typeof p?.case_count === "number") return p!.case_count;
  return 0;
}

// Run the probe against the box (network). Returns the classified outcome; the caller records it.
export async function probeLdApi(): Promise<CanaryOutcome> {
  const key = process.env.LD_API_KEY;
  if (!key) {
    // Unset key is an auth-class misconfig — same alarm channel as a rotted one.
    return { ok: false, kind: "auth", status: null, caseCount: null, detail: "LD_API_KEY is not set" };
  }
  const base = process.env.LD_API_BASE || "http://13.202.148.71:8080";
  const timeout = Number(process.env.LD_API_CANARY_TIMEOUT_MS ?? "15000");
  try {
    const r = await fetch(`${base}/advocate/${encodeURIComponent(CANARY_BAR_ID)}`, {
      headers: { "X-API-Key": key },
      signal: AbortSignal.timeout(timeout),
    });
    let caseCount: number | null = null;
    if (r.ok) {
      try { caseCount = caseCountFromPayload(await r.json()); } catch { caseCount = 0; }
    }
    return evaluateCanary({ reachable: true, status: r.status, caseCount });
  } catch {
    return evaluateCanary({ reachable: false, status: null, caseCount: null });
  }
}

// The provider key the canary writes its health under (kept distinct from the live-traffic
// "legaldriver" provider row so the synthetic signal is unambiguous on the health surface).
export const CANARY_PROVIDER = "legaldriver-canary";
