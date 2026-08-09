// WO-63 · Deploy-freshness kernel — "is prod actually running the latest `main`?"
//
// The incident: for days the fleet merged fixes to `main` but production never redeployed (Vercel
// Hobby deploy-quota stall) — prod sat 8+ commits behind, so every merged fix was invisible to the
// founder while the board said "DONE + DEPLOYING". Nothing ever compared prod's running SHA to
// `main`, so a total deploy stall produced ZERO signal. This is that missing signal.
//
// `evaluateFreshness` is a pure, Date-free, network-free classifier (unit-tested offline). `check
// DeployFreshness` is the thin GitHub-API shell the cron calls. The running prod SHA comes from
// Vercel's build-injected `VERCEL_GIT_COMMIT_SHA` — the cron runs INSIDE the production deployment,
// so that env var IS the live prod SHA (no need to curl ourselves).

// A just-merged commit is legitimately not-yet-live while its deploy builds. Only alarm once the
// oldest un-deployed commit has been sitting past this grace window — long enough that a healthy
// pipeline would have shipped it. Overridable via env for a slower/faster pipeline.
export const DEPLOY_GRACE_MIN_DEFAULT = 20;

export type FreshnessSeverity = "ok" | "stale" | "unknown";

export interface FreshnessInput {
  prodSha: string | null; // VERCEL_GIT_COMMIT_SHA of the running deployment (null = unknown/local)
  mainSha: string | null; // HEAD of origin/main per GitHub (null = couldn't read it)
  commitsBehind: number; // how many commits main is ahead of prod (0 = current)
  oldestUnshippedAgeMin: number | null; // age of the OLDEST un-deployed commit, minutes (null if none/unknown)
  graceMin?: number; // grace window before a lag counts as an alarm
}

export interface FreshnessOutcome {
  ok: boolean; // false ONLY on a real "stale" alarm — "unknown" is not an alarm (no false positives)
  severity: FreshnessSeverity;
  prodSha: string | null;
  prodShaShort: string | null;
  mainSha: string | null;
  mainShaShort: string | null;
  commitsBehind: number;
  oldestUnshippedAgeMin: number | null;
  detail: string; // short, PII-free reason (safe to store in health.last_error)
}

const short = (s: string | null) => (s ? s.slice(0, 7) : null);

// Pure evaluator — decide freshness from already-fetched facts. No network, no env, no Date.
export function evaluateFreshness(input: FreshnessInput): FreshnessOutcome {
  const grace = input.graceMin ?? DEPLOY_GRACE_MIN_DEFAULT;
  const base = {
    prodSha: input.prodSha,
    prodShaShort: short(input.prodSha),
    mainSha: input.mainSha,
    mainShaShort: short(input.mainSha),
    commitsBehind: input.commitsBehind,
    oldestUnshippedAgeMin: input.oldestUnshippedAgeMin,
  };

  // Can't tell → NOT an alarm (never cry wolf), but flagged so the missing input is visible/fixable.
  if (!input.prodSha) {
    return { ...base, ok: true, severity: "unknown", detail: "prod build SHA unknown (VERCEL_GIT_COMMIT_SHA unset — running locally or a non-Vercel build)" };
  }
  if (!input.mainSha) {
    return { ...base, ok: true, severity: "unknown", detail: "could not read origin/main HEAD (missing GITHUB_FRESHNESS_TOKEN for the private repo, or a GitHub API error)" };
  }

  if (input.commitsBehind <= 0 || input.prodSha === input.mainSha) {
    return { ...base, ok: true, severity: "ok", detail: `prod is current at ${short(input.prodSha)}` };
  }

  const age = input.oldestUnshippedAgeMin;
  const plural = input.commitsBehind === 1 ? "commit" : "commits";
  // Within the deploy grace window → the newest merge is probably still building; hold the alarm.
  if (age !== null && age < grace) {
    return { ...base, ok: true, severity: "ok", detail: `${input.commitsBehind} ${plural} behind main, oldest ${age}m old — within the ${grace}m deploy grace` };
  }

  const ageStr = age === null ? "unknown age" : `${age}m`;
  return {
    ...base,
    ok: false,
    severity: "stale",
    detail: `prod is ${input.commitsBehind} ${plural} behind main (oldest un-deployed: ${ageStr}) — a merge did not deploy. prod=${short(input.prodSha)} main=${short(input.mainSha)}`,
  };
}

// ---- network shell (the cron calls this) -------------------------------------------------------

export function runningProdSha(): string | null {
  // WO-323 · off Vercel there is no VERCEL_GIT_COMMIT_SHA; the build pipeline injects BUILD_SHA so the
  // freshness cron isn't permanently "unknown". Same source as /api/health.
  const s = process.env.VERCEL_GIT_COMMIT_SHA || process.env.BUILD_SHA;
  return s && s.trim() ? s.trim() : null;
}

interface GhCommit {
  sha: string;
  commit?: { committer?: { date?: string }; author?: { date?: string } };
}
interface GhCompare {
  status?: string;
  ahead_by?: number;
  commits?: GhCommit[];
}

export interface LagFacts {
  mainSha: string | null;
  commitsBehind: number;
  oldestUnshippedAgeMin: number | null;
  error?: string;
}

// Pure parser for GitHub's compare payload (base=prod, head=main): `ahead_by` = commits head has
// beyond base = commitsBehind; `commits[]` is oldest-first, so commits[0] = the oldest un-deployed
// commit (→ age vs `now`) and commits[last] = main HEAD. No network, no env, no Date.
export function parseCompareResponse(body: GhCompare | null, prodSha: string, now: number): LagFacts {
  const commits = Array.isArray(body?.commits) ? body!.commits! : [];
  const commitsBehind = typeof body?.ahead_by === "number" ? body!.ahead_by! : commits.length;
  const mainSha = commits.length ? commits[commits.length - 1].sha : prodSha; // identical → main===prod
  let oldestUnshippedAgeMin: number | null = null;
  if (commits.length) {
    const d = commits[0].commit?.committer?.date ?? commits[0].commit?.author?.date;
    if (d) {
      const ts = Date.parse(d);
      if (!Number.isNaN(ts)) oldestUnshippedAgeMin = Math.max(0, Math.round((now - ts) / 60000));
    }
  }
  return { mainSha, commitsBehind, oldestUnshippedAgeMin };
}

// Fetch main HEAD + how far prod is behind it via GitHub's compare API (one call). Thin network shell
// around the pure `parseCompareResponse`; degrades to non-alarming "unknown" facts on any error.
export async function fetchMainLag(opts: {
  repo: string; // "owner/name"
  prodSha: string;
  token?: string;
  now?: number; // injectable for testing; defaults to Date.now()
  timeoutMs?: number;
}): Promise<LagFacts> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "legaldriver-deploy-freshness",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;

  const url = `https://api.github.com/repos/${opts.repo}/compare/${encodeURIComponent(opts.prodSha)}...main`;
  try {
    const r = await fetch(url, { headers, signal: AbortSignal.timeout(opts.timeoutMs ?? 12000) });
    if (!r.ok) {
      return { mainSha: null, commitsBehind: 0, oldestUnshippedAgeMin: null, error: `GitHub compare HTTP ${r.status}` };
    }
    return parseCompareResponse((await r.json()) as GhCompare, opts.prodSha, opts.now ?? Date.now());
  } catch (e) {
    return { mainSha: null, commitsBehind: 0, oldestUnshippedAgeMin: null, error: `GitHub compare failed: ${e instanceof Error ? e.message : String(e)}` };
  }
}

// The provider key the freshness alarm writes under (distinct from live-traffic + canary rows so the
// deploy-pipeline signal is unambiguous on the health surface `getProviderHealth()` already reads).
export const FRESHNESS_PROVIDER = "deploy-freshness";

// Full network check: read the running SHA + compare to main, then classify. Used by the cron.
export async function checkDeployFreshness(opts?: { now?: number }): Promise<FreshnessOutcome> {
  const prodSha = runningProdSha();
  const repo = process.env.GITHUB_REPO || "spectre1811/legaldriver";
  const token = process.env.GITHUB_FRESHNESS_TOKEN || process.env.GITHUB_PAT || undefined;
  const graceMin = Number(process.env.DEPLOY_GRACE_MIN ?? DEPLOY_GRACE_MIN_DEFAULT);

  if (!prodSha) {
    return evaluateFreshness({ prodSha: null, mainSha: null, commitsBehind: 0, oldestUnshippedAgeMin: null, graceMin });
  }
  const lag = await fetchMainLag({ repo, prodSha, token, now: opts?.now });
  const outcome = evaluateFreshness({
    prodSha,
    mainSha: lag.mainSha,
    commitsBehind: lag.commitsBehind,
    oldestUnshippedAgeMin: lag.oldestUnshippedAgeMin,
    graceMin,
  });
  // Surface the underlying GitHub error in the detail so an "unknown" is diagnosable.
  if (lag.error && outcome.severity === "unknown") {
    return { ...outcome, detail: `${outcome.detail} [${lag.error}]` };
  }
  return outcome;
}
