import type { MailClient } from "./client";
import type { FetchResult, NormalizedEmail } from "./types";

// Deterministic mock mailbox with a few realistic legal emails + text attachments.
// Lets the whole ingest → classify → file pipeline run offline, no Google creds.
export class MockMailClient implements MailClient {
  readonly provider = "mock";
  constructor(private readonly seed = "demo") {}

  async fetchNew(sinceHistoryId?: string | null): Promise<FetchResult> {
    // If we've already "synced" (history present), return nothing new.
    if (sinceHistoryId) return { emails: [], newHistoryId: sinceHistoryId };

    const now = new Date();
    const iso = (mins: number) => new Date(now.getTime() - mins * 60000).toISOString();

    const emails: NormalizedEmail[] = [
      {
        providerId: `mock-${this.seed}-1`,
        from: "registry@districtcourt.gov.in",
        subject: "Order in Sharma v. Patel (7975/2022)",
        receivedAt: iso(30),
        snippet: "Please find attached the order dated today in the matter of Sharma v. Patel.",
        body: "Sir/Madam,\n\nPlease find attached the order passed in Civil Suit 7975/2022 (Sharma v. Patel). The matter is adjourned for evidence.\n\nRegistry",
        attachments: [
          {
            filename: "order_sharma_patel.txt",
            mime: "text/plain",
            data: Buffer.from(
              "IN THE DISTRICT COURT\nCivil Suit No. 7975/2022\nRajesh Sharma vs Suresh Patel\nORDER\nThe interim application is heard. Parties to file evidence by next date. Adjourned to 15-07-2026.\nAmount in dispute: Rs. 4,50,000.\n",
              "utf8",
            ),
          },
        ],
      },
      {
        providerId: `mock-${this.seed}-2`,
        from: "accounts@acmecorp.example",
        subject: "Invoice for retainer — Acme Corp",
        receivedAt: iso(120),
        snippet: "Attaching the signed retainer agreement and our GST invoice.",
        body: "Hi,\n\nAttaching the signed retainer agreement for Acme Corp and our invoice. Please confirm receipt.\n\nRegards,\nAccounts",
        attachments: [
          {
            filename: "acme_retainer.txt",
            mime: "text/plain",
            data: Buffer.from(
              "RETAINER AGREEMENT\nClient: Acme Corp\nScope: General litigation advisory\nFee: Rs. 1,00,000 per month\nDated: 01-06-2026\n",
              "utf8",
            ),
          },
        ],
      },
      {
        providerId: `mock-${this.seed}-3`,
        from: "noreply@newsletter.example",
        subject: "Legal tech weekly digest",
        receivedAt: iso(300),
        snippet: "This week in legal tech...",
        body: "Top stories in legal technology this week. Unsubscribe any time.",
        attachments: [],
      },
    ];

    return { emails, newHistoryId: "mock-history-1" };
  }

  // Mock backfill returns the same demo set (ingest dedupes on re-run).
  async fetchBackfill(): Promise<FetchResult> {
    return this.fetchNew(null);
  }
}
