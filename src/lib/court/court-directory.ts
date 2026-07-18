// WO-205 W1 · The court directory that scopes the console cause-list board to an advocate's
// state — state → district → court WITH court_id. Sourced from the platform's PUBLIC directory
// endpoint (`GET /v1/public/courts?state_code=`, the SAME one that powers peshi's court selector,
// reading `court.court`), so a court_id from here works directly in the keyed
// `getCauseList(court_id, date)` (both read the same `court.court` namespace).
//
// BP-11 (FG-2): this is a PUBLIC directory read — it MUST NOT go through the keyed
// `LegalDriverClient` (that client only ever hits `/v1/*` and never `/v1/public/*`; asserted by
// tests/wo01_sync_contract.ts). So the fetch lives here as its own leaf seam, no X-API-Key.
//
// The pure transforms (courtLabel / courtHasData / buildCourtOptions) are PORTED from peshi's
// offline-tested `court-select.ts` + `landing.ts` (WO-86/WO-81) — copied, not cross-imported
// (vendoring into the shared court-kit is WO-190's job; see the INBOX line dropped this WO).

import type { ComboOption } from "@/components/combobox/logic";

/** One court in the selector directory (mirrors the public `/v1/public/courts` court row). */
export interface CourtRef {
  court_id: number;
  name: string;
  bench_label?: string | null;
  latest_date?: string | null; // most recent date we hold a list for (ISO) — freshness
  list_days?: number; // how many distinct dates we hold (breadth)
}

/** A State→District→Court group in the directory (High Court groups have an empty district). */
export interface CourtGroup {
  tier: string; // HIGH | DISTRICT
  tier_label: string; // "High Court" | "District Court"
  state_code?: string | null;
  state_name?: string | null;
  district: string; // "" for High Court / when the source carries no district name
  courts: CourtRef[];
}

interface CourtsResponse {
  schema_version?: string;
  state_code?: string | null;
  groups?: CourtGroup[];
}

const tierRank = (tier: string | null | undefined): number =>
  (tier ?? "").toUpperCase() === "HIGH" ? 0 : 1;

/**
 * The court's clean display label: its name, plus ` · bench_label` **only** when the bench label
 * carries signal beyond the name (peshi WO-81 fix — many rows have `bench_label === name`,
 * which rendered a duplicated "X · X"; dropping that echo is the fix).
 */
export function courtLabel(c: { name: string; bench_label?: string | null }): string {
  const name = (c.name ?? "").trim();
  const bench = (c.bench_label ?? "").trim();
  return bench && bench !== name ? `${name} · ${bench}` : name;
}

/** The heading a group sorts/searches under: its district name, else the honest tier label. */
export function groupHeading(g: CourtGroup): string {
  return (g.district ?? "").trim() || g.tier_label;
}

/**
 * A court is offerable only when we actually hold ≥1 daily board for it — a `latest_date` AND a
 * positive `list_days`. Courts in the directory with no board on record are dropped so the picker
 * never offers a court that can only dead-end (honesty, not a wall of empty stubs). Ported from
 * peshi `landing.ts` `courtHasData`.
 */
export function courtHasData(c: CourtRef): boolean {
  return (c.list_days ?? 0) > 0 && Boolean((c.latest_date ?? "").trim());
}

/**
 * Flatten the API's State→District→Court groups into the flat combobox options the DS `<Combobox>`
 * renders — only courts we hold boards for, deterministically ordered (High Court tier first, then
 * by district heading, then by deduped court label). The court's district goes in `hint` so the
 * shared `filterOptions` matches on district too (peshi grouped by heading rows; the LD combobox
 * has no heading kind, so the group is carried as a searchable hint instead). `freshness` is the
 * court's latest board date, surfaced separately by the caller for the "updated Xh ago" stamp.
 */
export function buildCourtOptions(
  groups: CourtGroup[],
): (ComboOption<string> & { freshness: string | null })[] {
  const prepared = (groups ?? [])
    .map((g) => ({
      tier: g.tier,
      heading: groupHeading(g),
      courts: g.courts.filter(courtHasData).sort((a, b) =>
        courtLabel(a).localeCompare(courtLabel(b), undefined, { sensitivity: "base" }),
      ),
    }))
    .filter((g) => g.courts.length > 0) // drop groups with no held-board court
    .sort(
      (a, b) =>
        tierRank(a.tier) - tierRank(b.tier) ||
        a.heading.localeCompare(b.heading, undefined, { sensitivity: "base" }),
    );

  const rows: (ComboOption<string> & { freshness: string | null })[] = [];
  for (const g of prepared) {
    for (const c of g.courts) {
      rows.push({
        value: String(c.court_id),
        label: courtLabel(c),
        hint: g.heading, // searchable district/tier group (no heading row in the LD combobox)
        freshness: c.latest_date ?? null,
      });
    }
  }
  return rows;
}

// FAIL CLOSED (mirrors legaldriver.ts): a missing LD_API_BASE is a config error, never a silent
// default to a raw origin IP. The public directory shares the platform host with the keyed API.
function publicBase(): string {
  const base = process.env.LD_API_BASE;
  if (!base) {
    throw new Error(
      "LD_API_BASE is not set — refusing to load the court directory with no configured API base (fail-closed).",
    );
  }
  return base;
}

/**
 * Load the court directory for a state from the platform's public directory endpoint. Returns the
 * grouped State→District→Court list (only courts the platform tracks). Null on any failure — the
 * caller renders an honest "directory unavailable" state, never a fabricated list.
 */
export async function getCourtDirectory(stateCode: string): Promise<CourtGroup[] | null> {
  try {
    const res = await fetch(
      `${publicBase()}/v1/public/courts?state_code=${encodeURIComponent(stateCode)}`,
      {
        // Directory grows slowly — cache an hour (peshi caches this endpoint the same).
        next: { revalidate: 3600 },
        signal: AbortSignal.timeout(Number(process.env.LD_API_TIMEOUT_MS ?? "60000")),
      },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as CourtsResponse;
    return Array.isArray(data.groups) ? data.groups : null;
  } catch {
    return null;
  }
}
