// Integration test: client-first document filing (E2).
// Proves a document from a KNOWN client's email/phone files to that client even
// when it's NOT a legal matter and there is NO case to attach.
// Run: set -a; source .env; set +a; npx tsx tests/document_filing_test.ts
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveFiling, matchClientByContact } from "@/lib/docs/autofile";
import type { Classification } from "@/lib/docs/classify-core";

const admin = createAdminClient();
let ok = true;
const check = (name: string, pass: boolean, extra = "") => {
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${extra ? `  — ${extra}` : ""}`);
  if (!pass) ok = false;
};

async function main() {
  const { data: t } = await admin.from("tenant").select("id").limit(1).maybeSingle();
  if (!t) { console.log("no tenant in DB — skipping"); process.exit(0); }
  const tenantId = t.id;

  const email = `filing-test-${Date.now()}@example.com`;
  const phone = "919999000111";
  const { data: client } = await admin
    .from("client")
    .insert({ tenant_id: tenantId, name: `Filing Test ${Date.now()}`, type: "individual", emails: [email], phones: [phone] })
    .select("id")
    .single();
  if (!client) { console.log("could not create test client"); process.exit(1); }

  const createdMatters: string[] = [];
  try {
    const nonLegal: Classification = {
      doc_type: "correspondence", client_id: null, matter_id: null, confidence: 0.2,
      extracted: {}, summary: "", is_legal: false, suggested_client_name: null, suggested_matter_title: null,
    } as Classification;

    // 1) Known client matched by EMAIL sender, non-legal, NO case.
    const f1 = await resolveFiling(admin, tenantId, nonLegal, { email: `"Acme Corp" <${email}>` });
    check("email sender → known client", f1.clientId === client.id && f1.matchedClientByContact, `clientId=${f1.clientId}`);
    check("no case forced for client-first doc", f1.matterId === null && !f1.createdMatter);

    // 2) Known client matched by PHONE (messaging path), formatted differently.
    const f2 = await resolveFiling(admin, tenantId, nonLegal, { phone: "+91 99990 00111" });
    check("phone sender → known client", f2.clientId === client.id && f2.matchedClientByContact);

    // 3) Direct contact matcher.
    const m = await matchClientByContact(admin, tenantId, { email });
    check("matchClientByContact (email)", m === client.id);

    // 4) Unknown sender + non-legal → NOT filed, NOT created (no junk clients).
    const f4 = await resolveFiling(admin, tenantId, nonLegal, { email: `stranger-${Date.now()}@nowhere.test` });
    check("unknown non-legal sender stays unfiled", f4.clientId === null && !f4.createdClient && f4.matterId === null);

    // 5) Legal signal with a CNR → creates a case AND links the matched client.
    const cnr = `TESTCNR${Date.now()}`.slice(0, 16).toUpperCase();
    const legal: Classification = { ...nonLegal, is_legal: true, extracted: { cnrs: [cnr] }, suggested_matter_title: "Acme v. State" } as Classification;
    const f5 = await resolveFiling(admin, tenantId, legal, { email });
    if (f5.matterId) createdMatters.push(f5.matterId);
    check("legal+CNR → case created and linked to client", Boolean(f5.matterId) && f5.createdMatter && f5.clientId === client.id);
  } finally {
    for (const id of createdMatters) await admin.from("matter").delete().eq("id", id);
    await admin.from("client").delete().eq("id", client.id);
  }

  console.log(ok ? "\nDOCUMENT FILING: PASS" : "\nDOCUMENT FILING: FAIL");
  process.exit(ok ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
