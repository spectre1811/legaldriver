import type { FetchResult } from "./types";

// One seam for mailbox access. Mock for dev/test; Gmail for live ingest.
export interface MailClient {
  readonly provider: string;
  // Fetch new messages since the given historyId (incremental). On first run
  // (no historyId) the adapter does a bounded initial backfill.
  fetchNew(sinceHistoryId?: string | null): Promise<FetchResult>;
  // Fetch up to `maxMessages` of the most recent messages regardless of the sync
  // point (for "load earlier emails"). Does not advance the incremental cursor.
  fetchBackfill(maxMessages: number): Promise<FetchResult>;
}

// The mock takes a seed so tests are deterministic. The Gmail adapter takes an
// access token (obtained by refreshing the stored OAuth refresh token).
export function getMockMailClient(seed = "demo"): MailClient {
  const { MockMailClient } = require("./mock") as typeof import("./mock");
  return new MockMailClient(seed);
}

// `query` is the optional per-connection Gmail search scope (oauth_connection.gmail_query) —
// narrows which messages ingest on the list/backfill paths (WO-29 W1b).
export function getGmailClient(accessToken: string, query?: string | null): MailClient {
  const { GmailClient } = require("./gmail") as typeof import("./gmail");
  return new GmailClient(accessToken, query ?? null);
}
