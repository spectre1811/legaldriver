// WO-411 · F2 Share case file + Export as PDF — offline, no DB/network.
// Covers the security-sensitive share-token sign/verify/expiry/scope path (share-token.ts) and the
// hand-rolled PDF writer's structural correctness (docs/pdf.ts, court/case-file-pdf.ts).
// Run: npx tsx tests/wo411_share_export.ts

process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-secret-01234567890";

import { signShareToken, verifyShareToken } from "../src/lib/court/share-token";
import { buildPdf } from "../src/lib/docs/pdf";
import { buildCaseFilePdf } from "../src/lib/court/case-file-pdf";
import type { CaseFileData } from "../src/lib/court/case-file-data";

let failed = 0;
function ok(name: string, cond: boolean) {
  console.log(`${cond ? "✓" : "✗ FAIL"} ${name}`);
  if (!cond) failed++;
}

// ── share-token: sign/verify round trip ──────────────────────────────────────
{
  const { token, expiresAt } = signShareToken("tenant-A", "matter-1", 3600);
  ok("token carries the ec- prefix (not raw hex)", token.startsWith("ec-"));
  ok("token has no raw-hex-looking bare segment (payload/sig are base64url, joined by exactly one .)", token.split(".").length === 2);
  ok("expiresAt is a real, ~1h-out ISO timestamp", new Date(expiresAt).getTime() - Date.now() > 3500_000);

  const v = verifyShareToken(token);
  ok("verify: ok", v.ok);
  if (v.ok) {
    ok("verify: tenantId round-trips", v.tenantId === "tenant-A");
    ok("verify: matterId round-trips", v.matterId === "matter-1");
    ok("verify: expiresAt round-trips", v.expiresAt === expiresAt);
  }
}

// ── expiry enforcement ────────────────────────────────────────────────────────
{
  const { token } = signShareToken("tenant-A", "matter-1", -10); // already-expired
  const v = verifyShareToken(token);
  ok("an expired token is rejected", !v.ok && v.reason === "expired");
}

// ── tamper resistance (the actual security property) ─────────────────────────
{
  const { token } = signShareToken("tenant-A", "matter-1", 3600);
  const [payloadB64, sig] = token.slice(3).split(".");

  // Re-point the payload at a DIFFERENT case while keeping the original signature — this is
  // exactly the attack a stateless token must resist: without a valid signature over the new
  // payload, the scope in the token can never be widened/redirected.
  const forgedPayload = Buffer.from(JSON.stringify({ t: "tenant-A", m: "someone-elses-matter", exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url");
  const forged = `ec-${forgedPayload}.${sig}`;
  ok("a payload rewritten under the OLD signature is rejected (scope can't be widened)", !verifyShareToken(forged).ok);

  // Bit-flip the signature itself.
  const flippedSig = sig.slice(0, -1) + (sig.at(-1) === "A" ? "B" : "A");
  ok("a bit-flipped signature is rejected", !verifyShareToken(`ec-${payloadB64}.${flippedSig}`).ok);

  ok("garbage input is rejected, not thrown", !verifyShareToken("not-a-real-token").ok);
  ok("empty string is rejected", !verifyShareToken("").ok);
  ok("missing prefix is rejected (raw hex-ish input never passes)", !verifyShareToken(`${payloadB64}.${sig}`).ok);
}

// ── cross-tenant scope: two tokens signed for different tenants never collide ─
{
  const a = signShareToken("tenant-A", "matter-1", 3600);
  const b = signShareToken("tenant-B", "matter-1", 3600);
  ok("same matter id, different tenant → different tokens", a.token !== b.token);
  const va = verifyShareToken(a.token);
  const vb = verifyShareToken(b.token);
  ok("tenant A's token verifies to tenant A", va.ok && va.tenantId === "tenant-A");
  ok("tenant B's token verifies to tenant B", vb.ok && vb.tenantId === "tenant-B");
}

// ── fail-closed when unconfigured ─────────────────────────────────────────────
{
  const saved = process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  let threw = false;
  try { signShareToken("t", "m"); } catch { threw = true; }
  ok("signShareToken throws (fail-closed) when the signing secret is unset", threw);
  const v = verifyShareToken("ec-abc.def");
  ok("verifyShareToken reports unconfigured (not a false pass) when unset", !v.ok && v.reason === "unconfigured");
  process.env.SUPABASE_SERVICE_ROLE_KEY = saved;
}

// ── docs/pdf.ts: real PDF structure ───────────────────────────────────────────
{
  const bytes = buildPdf([{ kind: "h1", text: "Hello (World)" }, { kind: "text", text: "line two" }]);
  const s = Buffer.from(bytes).toString("latin1");
  ok("starts with the PDF header", s.startsWith("%PDF-1.4"));
  ok("has a Catalog object", s.includes("/Type /Catalog"));
  ok("has an xref table", s.includes("\nxref\n"));
  ok("has a trailer pointing at object 1 (Root)", /trailer\n<< \/Size \d+ \/Root 1 0 R >>/.test(s));
  ok("ends with %%EOF", s.trimEnd().endsWith("%%EOF"));
  ok("parens are escaped in content streams (won't break PDF string syntax)", s.includes("\\(World\\)"));
  ok("plain text made it into a content stream", s.includes("line two"));

  // Every xref offset actually points at "<n> 0 obj".
  const totalMatch = /\/Size (\d+)/.exec(s);
  const total = totalMatch ? Number(totalMatch[1]) : 0;
  const xrefBlock = /xref\n0 \d+\n([\s\S]*?)trailer/.exec(s)?.[1] ?? "";
  const entries = xrefBlock.trim().split("\n").slice(1); // drop the free (object 0) entry
  let offsetsValid = entries.length === total - 1;
  entries.forEach((line, i) => {
    const off = Number(line.slice(0, 10));
    offsetsValid = offsetsValid && s.slice(off, off + 20).startsWith(`${i + 1} 0 obj`);
  });
  ok("every xref byte offset lands exactly on its object's header", offsetsValid);
}

// ── docs/pdf.ts: pagination on overflow ───────────────────────────────────────
{
  const many = Array.from({ length: 120 }, (_, i) => ({ kind: "text" as const, text: `row ${i}` }));
  const bytes = buildPdf(many);
  const s = Buffer.from(bytes).toString("latin1");
  const pageCount = (s.match(/\/Type \/Page\b/g) ?? []).length; // (Pages object itself is /Type /Pages, distinct token)
  ok("120 short rows overflow onto more than one page", pageCount > 1);
  ok("row 0 present", s.includes("row 0"));
  ok("row 119 present (nothing silently dropped off the last page)", s.includes("row 119"));
}

// ── docs/pdf.ts: non-ASCII falls back honestly rather than corrupting the file ─
{
  const bytes = buildPdf([{ kind: "text", text: "₹100 — देवनागरी" }]);
  const s = Buffer.from(bytes).toString("latin1");
  ok("still a structurally valid PDF (still starts with the header)", s.startsWith("%PDF-1.4"));
  ok("still ends cleanly (unicode didn't break byte-length accounting)", s.trimEnd().endsWith("%%EOF"));
  ok("rupee sign maps to an ASCII-safe fallback", s.includes("Rs.100"));
}

// ── court/case-file-pdf.ts: real case data reaches the PDF ────────────────────
{
  const data: CaseFileData = {
    matterId: "m1",
    title: "Acme Pvt Ltd v. State",
    cnr: "GJAB010012342024",
    court: "District Court, Ahmedabad",
    caseType: "Civil",
    stage: "Arguments",
    status: "active",
    nextHearingDate: "2026-09-01",
    lastSyncedAt: "2026-08-01T10:00:00Z",
    source: "legaldriver",
    parties: [{ side: "Petitioner", name: "Acme Pvt Ltd", advocate: "Adv. Rao" }],
    hearings: [{ date: "2026-07-01", purpose: "Framing of issues", courtNo: "3", judge: "Justice X" }],
    orders: [{ date: "2026-06-15", title: "Interim stay granted" }],
    deadlines: [{ kind: "written_statement", dueDate: "2026-08-20", status: "open", jurisdictionRule: "CPC O.VIII R.1" }],
  };
  const bytes = buildCaseFilePdf(data);
  const s = Buffer.from(bytes).toString("latin1");
  ok("case title present", s.includes("Acme Pvt Ltd v. State"));
  ok("CNR present", s.includes("GJAB010012342024"));
  ok("party + advocate present", s.includes("Acme Pvt Ltd") && s.includes("Adv. Rao"));
  ok("hearing purpose present", s.includes("Framing of issues"));
  ok("order title present", s.includes("Interim stay granted"));
  ok("deadline kind present", s.includes("written statement"));
  ok("the mandatory disclaimer is present", s.includes("Not legal advice"));

  const empty: CaseFileData = { ...data, parties: [], hearings: [], orders: [], deadlines: [] };
  const emptyBytes = buildCaseFilePdf(empty);
  const emptyS = Buffer.from(emptyBytes).toString("latin1");
  ok("empty sections render an honest empty state, not a blank/broken section", emptyS.includes("No parties on record.") && emptyS.includes("No deadlines on record."));
}

console.log(failed === 0 ? "\nWO-411 SHARE/EXPORT: PASS" : `\nWO-411 SHARE/EXPORT: FAIL (${failed})`);
process.exit(failed === 0 ? 0 : 1);
