import type { MailClient } from "./client";
import type { FetchResult, NormalizedAttachment, NormalizedEmail } from "./types";

// Live Gmail adapter (gmail.readonly). Incremental via users.history.list using a
// stored historyId; first run falls back to messages.list (bounded backfill).
// Takes a short-lived access token (obtained by refreshing the stored refresh
// token — see src/lib/mail/oauth.ts). Field mappings verified at deploy.

const API = "https://gmail.googleapis.com/gmail/v1/users/me";

// WO-29 · ingestion hygiene (product-depth §5). Junk must never vacuum in silently. Gmail's
// messages.list already drops SPAM/TRASH, but NOT Promotions/Social; and the incremental
// history.list path ignores `q` entirely and reports EVERY messageAdded. So we (a) narrow the
// list query with these operators up front, and (b) — the guarantee — drop any message carrying
// an excluded label in the shared per-message fetch, which covers the history path too.
export const EXCLUDE_QUERY = "-in:spam -in:trash -category:promotions -category:social";
// SPAM/TRASH are ALWAYS dropped. Promotions/Social are dropped by default too — UNLESS the user
// explicitly flagged the message IMPORTANT or STARRED, in which case the human signal overrides
// Gmail's auto-categorization and we keep it (Gmail categories coexist with IMPORTANT/STARRED). This
// avoids silently losing a starred/important legal email that Gmail happened to auto-bin — §5 cuts
// both ways: never vacuum junk IN, but never silently vacuum a wanted message OUT either.
const HARD_EXCLUDED = new Set(["SPAM", "TRASH"]);
const SOFT_EXCLUDED = new Set(["CATEGORY_PROMOTIONS", "CATEGORY_SOCIAL"]);
const RESCUE_LABELS = new Set(["IMPORTANT", "STARRED"]);

// Combine the always-on junk exclusion with the optional per-connection scope (WO-29 W1b) into the
// Gmail list `q`. Space = AND, so both apply. Pure/unit-testable.
export function combineListQuery(userQuery: string | null | undefined): string {
  return [EXCLUDE_QUERY, userQuery?.trim()].filter(Boolean).join(" ");
}

// Pure predicate (unit-testable, no I/O): should this message be skipped as junk?
export function isJunkByLabels(labelIds: readonly string[] | null | undefined): boolean {
  const labels = labelIds ?? [];
  if (labels.some((l) => HARD_EXCLUDED.has(l))) return true; // spam/trash — always out
  if (labels.some((l) => RESCUE_LABELS.has(l))) return false; // human-flagged — always kept
  return labels.some((l) => SOFT_EXCLUDED.has(l)); // promotions/social — out by default
}

type Json = Record<string, unknown>;

function b64urlToBuffer(data: string): Buffer {
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

// Minimal HTML → text (WO-29 W3). Many emails ship HTML-only; without this their body was empty,
// starving classification/matter-linkage. Pure/dependency-free (no DOM): drop script/style, turn
// block/line breaks into newlines, strip tags, decode the common entities, collapse whitespace.
export function htmlToText(html: string): string {
  if (!html) return "";
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6]|table)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"').replace(/&#0?39;|&apos;/gi, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
function header(headers: Json[], name: string): string {
  const h = headers.find((x) => String(x.name).toLowerCase() === name.toLowerCase());
  return h ? String(h.value ?? "") : "";
}

export class GmailClient implements MailClient {
  readonly provider = "gmail";
  // `query` = optional per-connection scope (oauth_connection.gmail_query), combined with the
  // always-on junk exclusion on the list/backfill paths. The incremental history API ignores `q`,
  // so the query narrows backfill + cold-start only; junk is still dropped everywhere by the labels.
  constructor(private readonly accessToken: string, private readonly query: string | null = null) {}

  private listQuery(): string {
    return combineListQuery(this.query);
  }

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
      const list = await this.get(`/messages?maxResults=10&q=${encodeURIComponent(this.listQuery())}`);
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
    const list = await this.get(`/messages?maxResults=${cap}&q=${encodeURIComponent(this.listQuery())}`);
    const ids = ((list?.messages as Json[]) ?? []).map((m) => String(m.id));
    const emails = await this.fetchMessagesByIds([...new Set(ids)]);
    return { emails };
  }

  private async fetchMessagesByIds(ids: string[]): Promise<NormalizedEmail[]> {
    const emails: NormalizedEmail[] = [];
    for (const id of ids) {
      const msg = await this.get(`/messages/${id}?format=full`);
      if (!msg) continue;
      // Drop spam/promotions/social/trash regardless of how the id arrived (the history path
      // reports them; the list `q` doesn't apply there). This is the single hygiene guarantee.
      if (isJunkByLabels(msg.labelIds as string[] | undefined)) continue;
      const payload = (msg.payload as Json) ?? {};
      const headers = (payload.headers as Json[]) ?? [];
      const { plain, html, attachments } = await this.walkParts(id, payload);
      // Prefer the real plain-text part; fall back to a stripped HTML body (WO-29 W3).
      const body = plain.trim() ? plain : htmlToText(html);
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

  // Recursively collect the plain-text AND html bodies + attachments from a MIME tree. The caller
  // prefers plain, else strips the html — so HTML-only emails are no longer bodyless (WO-29 W3).
  private async walkParts(
    messageId: string,
    part: Json,
  ): Promise<{ plain: string; html: string; attachments: NormalizedAttachment[] }> {
    let plain = "";
    let html = "";
    const attachments: NormalizedAttachment[] = [];
    const mime = String(part.mimeType ?? "");
    const partBody = (part.body as Json) ?? {};
    const filename = String(part.filename ?? "");

    if (mime === "text/plain" && partBody.data && !filename) {
      plain += b64urlToBuffer(String(partBody.data)).toString("utf8");
    } else if (mime === "text/html" && partBody.data && !filename) {
      html += b64urlToBuffer(String(partBody.data)).toString("utf8");
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
      plain += sub.plain;
      html += sub.html;
      attachments.push(...sub.attachments);
    }
    return { plain, html, attachments };
  }
}
