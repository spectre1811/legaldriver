// WO-29 · Gmail ingestion hygiene. Run: npx tsx tests/wo29_gmail_hygiene.ts
// The guarantee: spam/promotions/social/trash never ingest, regardless of the path they arrive by
// (the incremental history feed ignores the list `q`, so the label check is the real gate).
import { isJunkByLabels, EXCLUDE_QUERY, GmailClient, combineListQuery, htmlToText } from "../src/lib/mail/gmail";

let failed = 0;
function ok(name: string, cond: boolean) {
  console.log(`${cond ? "✓" : "✗ FAIL"} ${name}`);
  if (!cond) failed++;
}

// Junk labels are excluded.
ok("SPAM excluded", isJunkByLabels(["INBOX", "SPAM"]) === true);
ok("TRASH excluded", isJunkByLabels(["TRASH"]) === true);
ok("Promotions excluded", isJunkByLabels(["CATEGORY_PROMOTIONS", "INBOX"]) === true);
ok("Social excluded", isJunkByLabels(["CATEGORY_SOCIAL"]) === true);

// Legitimate mail passes.
ok("plain inbox mail passes", isJunkByLabels(["INBOX", "IMPORTANT"]) === false);
ok("primary category passes", isJunkByLabels(["INBOX", "CATEGORY_PERSONAL"]) === false);
ok("empty/undefined labels pass", isJunkByLabels(undefined) === false && isJunkByLabels([]) === false);

// RESCUE: a human-flagged (starred/important) message survives even if Gmail auto-binned it
// Promotions/Social — never silently lose a wanted legal email (WO-29 review fix).
ok("STARRED rescues a promotions message", isJunkByLabels(["CATEGORY_PROMOTIONS", "STARRED"]) === false);
ok("IMPORTANT rescues a social message", isJunkByLabels(["CATEGORY_SOCIAL", "IMPORTANT"]) === false);
ok("SPAM is NOT rescued by STARRED (hard drop)", isJunkByLabels(["SPAM", "STARRED"]) === true);

// The list query narrows up front (defense in depth for the list path).
ok("exclude query drops promotions+social+spam+trash",
  /-in:spam/.test(EXCLUDE_QUERY) && /-category:promotions/.test(EXCLUDE_QUERY) && /-category:social/.test(EXCLUDE_QUERY));

// W3: HTML-only bodies are no longer empty — stripped to text for classification.
ok("html tags stripped to text", htmlToText("<p>Hello <b>world</b></p>").replace(/\s+/g, " ").trim() === "Hello world");
ok("script/style bodies dropped", !/color|function/.test(htmlToText("<style>a{color:red}</style><script>function f(){}</script><p>Body</p>")));
ok("br/p become line breaks", htmlToText("<p>Line1</p><p>Line2</p>").includes("\n"));
ok("entities decoded", htmlToText("Smith &amp; Co &lt;legal&gt;") === "Smith & Co <legal>");
ok("empty html → empty string", htmlToText("") === "");

// W1b: the per-connection scope ANDs with the always-on exclusion (never replaces it).
ok("no user query → just the exclusion", combineListQuery(null) === EXCLUDE_QUERY && combineListQuery("  ") === EXCLUDE_QUERY);
ok("user query is appended after the exclusion", combineListQuery("from:x@y.test") === `${EXCLUDE_QUERY} from:x@y.test`);
ok("junk exclusion survives a user scope", /-in:spam/.test(combineListQuery("label:legal")));

// INTEGRATION: the guarantee end-to-end. Drive the INCREMENTAL history path (the one that ignores
// the list `q`) with a fake Gmail API and assert junk is dropped in fetchMessagesByIds — a starred
// promotions msg survives, a SPAM msg does not — even though history reported all of them.
async function historyPathTest() {
  const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64");
  const messages: Record<string, { labelIds: string[] }> = {
    junk: { labelIds: ["INBOX", "SPAM"] },
    clean: { labelIds: ["INBOX"] },
    star: { labelIds: ["INBOX", "CATEGORY_PROMOTIONS", "STARRED"] }, // Gmail auto-binned but user-starred
  };
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL) => {
    const u = String(url);
    let data: unknown = {};
    if (u.includes("/history?")) {
      data = { history: [{ messagesAdded: Object.keys(messages).map((id) => ({ message: { id } })) }], historyId: "200" };
    } else {
      const id = (u.match(/\/messages\/([^?]+)/) ?? [])[1] ?? "";
      const m = messages[id];
      data = m ? { id, historyId: "200", internalDate: "1700000000000", snippet: id, labelIds: m.labelIds, payload: { headers: [{ name: "From", value: `${id}@x.test` }, { name: "Subject", value: id }], mimeType: "text/plain", body: { data: b64(`body-${id}`) } } } : null;
    }
    return { ok: true, status: 200, json: async () => data } as Response;
  }) as typeof fetch;

  try {
    const client = new GmailClient("fake-token");
    const { emails } = await client.fetchNew("100"); // incremental (history) path
    const ids = emails.map((e) => e.providerId).sort();
    ok("history path: SPAM dropped, starred-promotions kept", ids.length === 2 && ids.join(",") === "clean,star");
  } finally {
    globalThis.fetch = realFetch;
  }
}

// INTEGRATION: body selection through walkParts — prefer text/plain, else strip the html; and an
// ATTACHED .txt/.html (has a filename) must not be treated as the body (WO-29 W3).
async function bodyParsingTest() {
  const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64");
  const payloads: Record<string, Json> = {
    alt: { labelIds: ["INBOX"], payload: { headers: [], parts: [
      { mimeType: "text/plain", body: { data: b64("PLAIN wins") } },
      { mimeType: "text/html", body: { data: b64("<p>html loses</p>") } },
    ] } },
    htmlonly: { labelIds: ["INBOX"], payload: { headers: [], mimeType: "multipart/alternative", parts: [
      { mimeType: "text/html", body: { data: b64("<b>Only</b> html body") } },
    ] } },
    attach: { labelIds: ["INBOX"], payload: { headers: [], parts: [
      { mimeType: "text/plain", filename: "notes.txt", body: { attachmentId: "att1" } }, // ATTACHMENT, not body
      { mimeType: "text/html", body: { data: b64("real body") } },
    ] } },
  };
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL) => {
    const u = String(url);
    let data: unknown = {};
    if (u.includes("/history?")) data = { history: [{ messagesAdded: Object.keys(payloads).map((id) => ({ message: { id } })) }], historyId: "200" };
    else if (u.includes("/attachments/")) data = { data: b64("ATTACHMENT CONTENT — not the body") };
    else { const id = (u.match(/\/messages\/([^?]+)/) ?? [])[1] ?? ""; data = payloads[id] ? { id, internalDate: "1", snippet: id, ...payloads[id] } : null; }
    return { ok: true, status: 200, json: async () => data } as Response;
  }) as typeof fetch;

  type Json = Record<string, unknown>;
  try {
    const { emails } = await new GmailClient("t").fetchNew("100");
    const byId = new Map(emails.map((e) => [e.providerId, e.body]));
    ok("multipart/alternative prefers plain", (byId.get("alt") ?? "").trim() === "PLAIN wins");
    ok("html-only falls back to stripped html", (byId.get("htmlonly") ?? "").replace(/\s+/g, " ").trim() === "Only html body");
    ok("attached .txt is NOT the body (html used)", (byId.get("attach") ?? "").trim() === "real body");
  } finally {
    globalThis.fetch = realFetch;
  }
}

// double-decode order: &amp;lt; must decode to the literal &lt;, not to <.
ok("entity decode order (&amp;lt; → &lt;)", htmlToText("A &amp;lt; B") === "A &lt; B");

historyPathTest().then(bodyParsingTest).then(() => {
  console.log(failed === 0 ? "\nPASS" : `\nFAIL (${failed})`);
  process.exit(failed === 0 ? 0 : 1);
});
