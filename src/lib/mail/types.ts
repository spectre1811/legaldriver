// Provider-agnostic mail shapes. Mock + Gmail adapters both return these.

export interface NormalizedAttachment {
  filename: string;
  mime: string;
  data: Buffer; // raw bytes
}

export interface NormalizedEmail {
  providerId: string; // gmail message id (or mock id)
  historyId?: string;
  from: string;
  subject: string;
  receivedAt: string; // ISO
  snippet: string;
  body: string; // plain-text body
  attachments: NormalizedAttachment[];
}

export interface FetchResult {
  emails: NormalizedEmail[];
  newHistoryId?: string;
}
