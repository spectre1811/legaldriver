// Provider-agnostic, normalized court-data shapes. Every CourtDataClient impl
// (mock, eCourtsIndia, future own-store) returns THESE types, so the rest of the
// app never sees a provider's raw JSON. Adapters map provider → these.

export interface NormalizedParty {
  name: string;
  side?: "petitioner" | "respondent" | "other";
  advocate?: string;
  // eCourts masks protected-matter parties (matrimonial/POCSO/juvenile) as "XXXXXXX".
  // Set at map() time (BP-24) so the flag rides with the party everywhere — render as
  // "name withheld", and never use as a client-match / search key.
  masked?: boolean;
}

export interface NormalizedHearing {
  date: string; // ISO date (YYYY-MM-DD)
  purpose?: string;
  courtNo?: string;
  judge?: string;
  raw?: unknown;
}

export interface NormalizedOrderRef {
  id: string;
  date?: string;
  title?: string;
  pdfUrl?: string; // signed/open PDF link when the provider already has it
}

export interface NormalizedCase {
  cnr: string;
  title: string;
  court?: string;
  caseType?: string;
  stage?: string;
  status?: string;
  parties: NormalizedParty[];
  judge?: string;
  nextHearingDate?: string | null; // ISO date
  hearings: NormalizedHearing[];
  orders: NormalizedOrderRef[];
  // Phase 3 (E4): richer detail for the case page + similar-case discovery.
  acts?: string[]; // acts & sections, e.g. "NI Act 138"
  judges?: string[]; // normalized coram list
  detail?: Record<string, unknown>; // registration/filing metadata kept verbatim-normalized
  // Provenance — always set by the adapter.
  source: string; // e.g. "ecourtsindia" | "mock"
  fetchedAt: string; // ISO timestamp
}

export interface CaseSearchResult {
  cnr: string;
  title: string;
  court?: string;
  parties?: string;
}

export interface CauseListItem {
  listDate: string; // ISO date
  court?: string;
  itemNo?: string;
  cnr?: string;
  title?: string;
  raw?: unknown;
}

export interface CourtOrder {
  id: string;
  cnr: string;
  date?: string;
  pdfUrl?: string;
  markdown?: string;
  aiSummary?: string;
}

export interface AdvocateQuery {
  name?: string;
  barNumber?: string; // e.g. "MAH/1234/1982"
  court?: string;
  stateCode?: string;
}

export interface CauseListQuery {
  date: string; // ISO date
  name?: string;
  barNumber?: string;
  court?: string;
  stateCode?: string;
}

// A "your tracked case is listed on this date" hit — the daily cause-list alert. Keyed by CNR
// (matched against tracked matters), so it needs no court mapping on the consumer side.
export interface CauseListListing {
  cnr: string;
  listDate: string; // ISO date
  itemNo?: string;
  caseNumber?: string;
  type?: string; // "civil" | "criminal"
  parties?: string;
  advocate?: string;
  judge?: string;
  courtId?: number;
}
