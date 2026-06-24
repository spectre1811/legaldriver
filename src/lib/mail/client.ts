import type { FetchResult } from "./types";

// One seam for mailbox access. Mock for dev/test; Gmail for live ingest.
export interface MailClient {
  readonly provider: string;
  // Fetch new messages since the given historyId (incremental). On first run
  // (no historyId) the adapter does a bounded initial backfill.
  fetchNew(sinceHistoryId?: string | null): Promise<FetchResult>;
}

// The mock takes a seed so tests are deterministic. The Gmail adapter takes an
// access token (obtained by refreshing the stored OAuth refresh token).
export function getMockMailClient(seed = "demo"): MailClient {
  const { MockMailClient } = require("./mock") as typeof import("./mock");
  return new MockMailClient(seed);
}

export function getGmailClient(accessToken: string): MailClient {
  const { GmailClient } = require("./gmail") as typeof import("./gmail");
  return new GmailClient(accessToken);
}
