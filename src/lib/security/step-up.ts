// WO-323 W1 · Turnstile step-up for the public, unauthenticated surfaces (today: /request-access).
//
// Posture (design §7): raise cost-per-record, shrink records-per-identity. A Turnstile challenge
// fires ONLY as a STEP-UP — when the per-IP limiter trips — never on the happy path, and only once
// `TURNSTILE_SECRET_KEY` is wired. Before that the existing controls (honeypot + per-email dedupe +
// text caps) remain the backstop and we just log the would-be step-up.

export type StepUpResult = { ok: true } | { ok: false; reason: "challenge_required" | "challenge_failed" };

// ponytail: in-process sliding window — correct for the single-origin box (server actions + route
// handlers share one Node process under `output:standalone`). Swap for a shared store at origin #2.
const hits = new Map<string, number[]>();

function tripped(key: string, windowMs: number, soft: number, now: number): boolean {
  const arr = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  arr.push(now);
  hits.set(key, arr);
  if (hits.size > 10_000) {
    for (const [k, v] of hits) if (v.every((t) => now - t >= windowMs)) hits.delete(k);
  }
  return arr.length > soft;
}

async function verifyTurnstile(token: string, ip: string, secret: string): Promise<boolean> {
  try {
    const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, response: token, ...(ip ? { remoteip: ip } : {}) }),
      cache: "no-store",
    });
    const d = (await r.json().catch(() => ({}))) as { success?: boolean };
    return d.success === true;
  } catch {
    return false;
  }
}

/**
 * Decide whether an expensive public action may proceed. Returns `{ ok: true }` on the happy path
 * or when Turnstile isn't wired; otherwise requires a valid token once the per-IP soft cap trips.
 */
export async function stepUp(opts: {
  ip: string;
  action: string;
  token?: string | null;
  windowMs?: number;
  soft?: number;
}): Promise<StepUpResult> {
  const { ip, action, token } = opts;
  const windowMs = opts.windowMs ?? 10 * 60_000;
  const soft = opts.soft ?? 5;
  if (!tripped(`${action}:${ip || "unknown"}`, windowMs, soft, Date.now())) return { ok: true };

  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    console.warn(`[abuse] step-up warranted for ${action} ip=${ip ? "set" : "unknown"} — TURNSTILE_SECRET_KEY unset; existing controls are the backstop`);
    return { ok: true };
  }
  if (!token) return { ok: false, reason: "challenge_required" };
  if (!(await verifyTurnstile(token, ip, secret))) return { ok: false, reason: "challenge_failed" };
  return { ok: true };
}

// Test-only: reset the in-process window between assertions.
export function __resetStepUp() {
  hits.clear();
}
