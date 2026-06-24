// Self-hosted classification worker. Runs on a box where Claude Code is installed
// + logged in (this VM, your laptop, a small VPS). It pulls the needs-review queue
// from Supabase, classifies each email with OUR Claude Code (no API key), auto-
// creates clients/cases from the parsed content, files them, and writes results
// back. Only OUTBOUND calls (Supabase + the local `claude` binary) — no inbound
// exposure, no tunnel. This is how the Vercel-hosted app gets free auto-classification.
//
//   Run once:   npx tsx scripts/classify-worker.ts
//   Run a loop: npx tsx scripts/classify-worker.ts --loop          (every 60s)
//
// Reality check: this uses your Claude Code subscription as a backend, which is a
// gray area vs. its intended interactive use, and requires this box to stay running.
// For a real production deployment, set ANTHROPIC_API_KEY instead (API backend).
import { readFileSync } from "node:fs";

for (const l of readFileSync(".env", "utf8").split("\n")) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
}
// Force the CLI backend on the worker (don't accidentally use a stray API key).
process.env.CLASSIFIER_BACKEND = process.env.CLASSIFIER_BACKEND ?? "cli";

const BATCH = Number(process.env.WORKER_BATCH ?? "25");
const INTERVAL_MS = Number(process.env.WORKER_INTERVAL_MS ?? "60000");
const THRESHOLD = Number(process.env.CONFIDENCE_THRESHOLD ?? "0.7");

async function main() {
  const { createAdminClient } = await import("../src/lib/supabase/admin");
  const { completeJson } = await import("../src/lib/ai/complete");
  const { buildClassifyPrompt, CLASSIFY_SCHEMA, normalizeClassification } = await import("../src/lib/docs/classify-core");
  const { resolveFiling } = await import("../src/lib/docs/autofile");
  const admin = createAdminClient();

  type Shortlist = { clients: { id: string; name: string }[]; matters: { id: string; title: string; cnr?: string | null }[] };

  async function pass(): Promise<number> {
    // Only rows never touched by a model (confidence = 0, the "off"-backend default).
    const { data: emails } = await admin
      .from("email_message")
      .select("id, tenant_id, subject, snippet")
      .eq("status", "needs_review")
      .eq("confidence", 0)
      .limit(BATCH);
    if (!emails?.length) {
      console.log(new Date().toISOString(), "— nothing to classify");
      return 0;
    }

    const cache = new Map<string, Shortlist>();
    let processed = 0, filed = 0, created = 0;

    for (const em of emails) {
      let sl = cache.get(em.tenant_id);
      if (!sl) {
        const [{ data: clients }, { data: matters }] = await Promise.all([
          admin.from("client").select("id, name").eq("tenant_id", em.tenant_id).limit(100),
          admin.from("matter").select("id, title, cnr").eq("tenant_id", em.tenant_id).limit(100),
        ]);
        sl = { clients: clients ?? [], matters: matters ?? [] };
        cache.set(em.tenant_id, sl);
      }

      const { data: docs } = await admin.from("document").select("parsed_text").eq("email_message_id", em.id);
      const docText = (docs ?? []).map((d) => d.parsed_text || "").filter(Boolean).join("\n\n");
      const input = {
        filename: `email:${em.subject ?? ""}`,
        docTextOrSnippet: `${em.subject ?? ""}\n${em.snippet ?? ""}\n${docText}`.trim(),
        clients: sl.clients,
        matters: sl.matters,
      };

      const raw = await completeJson(buildClassifyPrompt(input), CLASSIFY_SCHEMA as unknown as Record<string, unknown>);
      const cls = normalizeClassification(raw, input);
      const filing = await resolveFiling(admin, em.tenant_id, cls);
      if (filing.createdClient && cls.suggested_client_name) { sl.clients.push({ id: filing.clientId!, name: cls.suggested_client_name }); created++; }
      if (filing.createdMatter) { sl.matters.push({ id: filing.matterId!, title: cls.suggested_matter_title ?? "Case", cnr: cls.extracted.cnrs?.[0] ?? null }); created++; }

      const fileable = Boolean(filing.clientId || filing.matterId);
      const confident = cls.confidence >= THRESHOLD || filing.createdClient || filing.createdMatter;
      const status = fileable && confident ? "filed" : "needs_review";
      if (status === "filed") filed++;

      // mark attempted (non-zero confidence) so we never reprocess this row
      await admin.from("email_message").update({
        classified_client_id: filing.clientId,
        classified_matter_id: filing.matterId,
        confidence: Math.max(cls.confidence, 0.001),
        status,
      }).eq("id", em.id);
      if (status === "filed") {
        await admin.from("document").update({ client_id: filing.clientId, matter_id: filing.matterId }).eq("email_message_id", em.id);
      }

      processed++;
      console.log(`  [${status}] "${(em.subject ?? "").slice(0, 48)}" conf=${cls.confidence}${filing.createdMatter ? " +case" : ""}${filing.createdClient ? " +client" : ""}`);
    }
    console.log(`pass done: processed=${processed} filed=${filed} created=${created}`);
    return processed;
  }

  if (process.argv.includes("--loop")) {
    console.log(`worker loop started (batch ${BATCH}, every ${INTERVAL_MS}ms)`);
    // eslint-disable-next-line no-constant-condition
    while (true) {
      await pass();
      await new Promise((r) => setTimeout(r, INTERVAL_MS));
    }
  } else {
    await pass();
  }
}

main().catch((e) => { console.error("worker error:", e); process.exit(1); });
