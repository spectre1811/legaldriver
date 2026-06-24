import type { MailClient } from "./client";
import type { FetchResult, NormalizedAttachment, NormalizedEmail } from "./types";

// Live Gmail adapter (gmail.readonly). Incremental via users.history.list using a
// stored historyId; first run falls back to messages.list (bounded backfill).
// Takes a short-lived access token (obtained by refreshing the stored refresh
// token — see src/lib/mail/oauth.ts). Field mappings verified at deploy.

const API = "https://gmail.googleapis.com/gmail/v1/users/me";

type Json = Record<string, unknown>;

function b64urlToBuffer(data: string): Buffer {
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}
function header(headers: Json[], name: string): string {
  const h = headers.find((x) => String(x.name).toLowerCase() === name.toLowerCase());
  return h ? String(h.value ?? "") : "";
}

export class GmailClient implements MailClient {
  readonly provider = "gmail";
  constructor(private readonly accessToken: string) {}

  private async get(path: string): Promise<Json | null> {
    const res = await fetch(`${API}${path}`, {
      headers: { Authorization: `Bearer ${this.accessToken}` },
      cache: "no-store",
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`gmail GET ${path} -> ${res.status}`);
    return (await res.json()) as Json;
  }

  async fetchNew(sinceHistoryId?: string | null): Promise<FetchResult> {
    let ids: string[] = [];
    let newHistoryId = sinceHistoryId ?? undefined;

    if (sinceHistoryId) {
      const hist = await this.get(`/history?startHistoryId=${sinceHistoryId}&historyTypes=messageAdded`);
      const history = (hist?.history as Json[]) ?? [];
      for (const h of history) {
        for (const m of (h.messagesAdded as Json[]) ?? []) {
          const msg = m.message as Json;
          if (msg?.id) ids.push(String(msg.id));
        }
      }
      if (hist?.historyId) newHistoryId = String(hist.historyId);
    } else {
      const list = await this.get(`/messages?maxResults=10`);
      ids = ((list?.messages as Json[]) ?? []).map((m) => String(m.id));
      const profile = await this.get(`/profile`);
      if (profile?.historyId) newHistoryId = String(profile.historyId);
    }

    const emails = await this.fetchMessagesByIds([...new Set(ids)]);
    return { emails, newHistoryId };
  }

  // Load up to maxMessages of the most recent messages (for "load earlier emails").
  // Does NOT return a new historyId, so it won't advance the incremental cursor;
  // ingest dedupes already-stored messages, netting the older ones.
  async fetchBackfill(maxMessages: number): Promise<FetchResult> {
    const cap = Math.min(Math.max(maxMessages, 1), 100);
    const list = await this.get(`/messages?maxResults=${cap}`);
    const ids = ((list?.messages as Json[]) ?? []).map((m) => String(m.id));
    const emails = await this.fetchMessagesByIds([...new Set(ids)]);
    return { emails };
  }

  private async fetchMessagesByIds(ids: string[]): Promise<NormalizedEmail[]> {
    const emails: NormalizedEmail[] = [];
    for (const id of ids) {
      const msg = await this.get(`/messages/${id}?format=full`);
      if (!msg) continue;
      const payload = (msg.payload as Json) ?? {};
      const headers = (payload.headers as Json[]) ?? [];
      const { body, attachments } = await this.walkParts(id, payload);
      emails.push({
        providerId: id,
        historyId: msg.historyId ? String(msg.historyId) : undefined,
        from: header(headers, "From"),
        subject: header(headers, "Subject"),
        receivedAt: msg.internalDate ? new Date(Number(msg.internalDate)).toISOString() : new Date().toISOString(),
        snippet: String(msg.snippet ?? ""),
        body,
        attachments,
      });
    }
    return emails;
  }

  // Recursively collect the plain-text body + attachments from a MIME tree.
  private async walkParts(
    messageId: string,
    part: Json,
  ): Promise<{ body: string; attachments: NormalizedAttachment[] }> {
    let body = "";
    const attachments: NormalizedAttachment[] = [];
    const mime = String(part.mimeType ?? "");
    const partBody = (part.body as Json) ?? {};
    const filename = String(part.filename ?? "");

    if (mime === "text/plain" && partBody.data) {
      body += b64urlToBuffer(String(partBody.data)).toString("utf8");
    } else if (filename && partBody.attachmentId) {
      const att = await this.get(`/messages/${messageId}/attachments/${partBody.attachmentId}`);
      if (att?.data) {
        attachments.push({
          filename,
          mime: mime || "application/octet-stream",
          data: b64urlToBuffer(String(att.data)),
        });
      }
    }

    for (const child of (part.parts as Json[]) ?? []) {
      const sub = await this.walkParts(messageId, child);
      body += sub.body;
      attachments.push(...sub.attachments);
    }
    return { body, attachments };
  }
}
