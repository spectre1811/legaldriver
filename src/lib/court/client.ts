import type {
  AdvocateQuery,
  CaseSearchResult,
  CauseListItem,
  CauseListQuery,
  CourtOrder,
  NormalizedCase,
} from "./types";

// The single seam for all court data. Swapping providers = swapping the impl
// returned by getCourtDataClient(). Day-to-day reads come from our own Postgres;
// this client is only used on add-case + scheduled refresh + cause-list pull.
export interface CourtDataClient {
  readonly source: string;

  /** Full case detail by CNR (parties, advocates, judge, hearings, orders, next date). */
  getCaseByCNR(cnr: string): Promise<NormalizedCase | null>;

  /** Find cases for an advocate by name or bar registration number. */
  searchByAdvocate(q: AdvocateQuery): Promise<CaseSearchResult[]>;

  /** Date-wise cause list for an advocate (the "what's on my plate" feature). */
  getCauseList(q: CauseListQuery): Promise<CauseListItem[]>;

  /** Force a live refresh of tracked cases. Bulk providers cap at 50 per call. */
  refreshCases(cnrs: string[]): Promise<NormalizedCase[]>;

  /** A single order (signed PDF + extracted markdown + AI summary where available). */
  getOrder(cnr: string, orderId: string): Promise<CourtOrder | null>;
}

let cached: CourtDataClient | null = null;

// Provider selection. Defaults to the free mock unless COURT_DATA_PROVIDER is set
// to "ecourtsindia" AND a token is present. The mock is also forced when no token
// exists, so local dev never fails on a missing/blocked provider.
export function getCourtDataClient(): CourtDataClient {
  if (cached) return cached;

  const provider = process.env.COURT_DATA_PROVIDER ?? "mock";
  const token = process.env.ECOURTSINDIA_API_TOKEN;
  const ldKey = process.env.LD_API_KEY;

  // LegalDriver API (our own, compliant) is the canonical provider — use it WHENEVER its
  // key is present, regardless of COURT_DATA_PROVIDER. This avoids the footgun where a
  // stale COURT_DATA_PROVIDER=ecourtsindia (from before LD existed) silently re-syncs cases
  // through the legacy provider (synthetic order ids → broken PDFs). Set the env to
  // "ecourtsindia" AND unset LD_API_KEY only to deliberately fall back to the legacy adapter.
  if (ldKey && provider !== "ecourtsindia_force") {
    const { LegalDriverClient } = require("./legaldriver") as typeof import("./legaldriver");
    cached = new LegalDriverClient(ldKey);
  } else if (provider === "ecourtsindia" && token) {
    // Lazy require so the mock path has zero dependency on the live adapter.
    const { ECourtsIndiaClient } = require("./ecourtsindia") as typeof import("./ecourtsindia");
    cached = new ECourtsIndiaClient(token);
  } else {
    const { MockCourtDataClient } = require("./mock") as typeof import("./mock");
    cached = new MockCourtDataClient();
  }
  return cached;
}

// For tests / explicit overrides.
export function setCourtDataClient(client: CourtDataClient | null) {
  cached = client;
}
