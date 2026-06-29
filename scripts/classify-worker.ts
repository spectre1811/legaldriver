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
  const { buildCaseSummaryPrompt, CASE_SUMMARY_SCHEMA, normalizeCaseSummary } = await import("../src/lib/docs/case-summary");
  const { synthesize } = await import("../src/lib/services/agent/agent");
  const { synthesizeDraft } = await import("../src/lib/services/draft/draft");
  const { suggestReply } = await import("../src/lib/services/agent/reply");
  const embeddingsOn = process.env.EMBEDDINGS_DISABLED !== "1";
  const emb = embeddingsOn ? await import("../src/lib/services/agent/embed") : null;
  const ocrOn = process.env.OCR_DISABLED !== "1";
  const ocrMod = ocrOn ? await import("../src/lib/docs/ocr/index") : null;
  const langMod = ocrOn ? await import("../src/lib/docs/ocr/lang") : null;
  const admin = createAdminClient();

  // Backfill semantic chunks for documents that have parsed text but no chunks yet.
  // Local model (bge-small via transformers.js) — keyless. Bounded per tick.
  async function embedDocuments(): Promise<number> {
    if (!emb) return 0;
    const { data: chunked } = await admin.from("document_chunk").select("document_id");
    const have = new Set((chunked ?? []).map((c) => c.document_id));
    const { data: docs } = await admin
      .from("document")
      .select("id, tenant_id, matter_id, client_id, parsed_text")
      .not("parsed_text", "is", null)
      .limit(200);
    const todo = (docs ?? []).filter((d) => d.parsed_text && !have.has(d.id)).slice(0, 5);
    if (!todo.length) return 0;
    let done = 0;
    for (const d of todo) {
      const chunks = emb.chunkText(d.parsed_text as string, 1200).slice(0, 20);
      let i = 0;
      for (const c of chunks) {
        try {
          const v = await emb.embedPassage(c);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await admin.from("document_chunk").insert({ tenant_id: d.tenant_id, document_id: d.id, matter_id: d.matter_id, client_id: d.client_id, chunk_index: i, content: c, embedding: emb.toVectorLiteral(v) as any });
          done++;
        } catch { /* skip a bad chunk */ }
        i++;
      }
    }
    if (done) console.log(`  [embed] ${done} chunks across ${todo.length} docs`);
    return done;
  }

  // OCR scanned/image-only documents the app flagged `needsOcr`. Runs on-box
  // (keyless Tesseract by default — bytes never leave our trust boundary), fills
  // parsed_text + OCR provenance, and clears the flag so embedding/classification
  // pick the doc up next tick. Each doc is attempted once (ocrTried stamp) so a
  // scan OCR can't read doesn't loop forever — it stays flagged for human re-OCR.
  async function ocrPending(): Promise<number> {
    if (!ocrMod || !langMod) return 0;
    const { data: docs } = await admin
      .from("document")
      .select("id, tenant_id, storage_path, mime, filename, extracted, parsed_text")
      .filter("extracted->>needsOcr", "eq", "true")
      .not("storage_path", "is", null)
      .limit(BATCH);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const todo = (docs ?? []).filter((d) => !(d.extracted as any)?.ocrTried && !(d.parsed_text && d.parsed_text.length > 40)).slice(0, 3);
    if (!todo.length) return 0;
    let done = 0;
    for (const d of todo) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const prev = (d.extracted ?? {}) as any;
      const at = new Date().toISOString();
      try {
        const dl = await admin.storage.from("documents").download(d.storage_path as string);
        if (!dl.data) { await admin.from("document").update({ extracted: { ...prev, ocrTried: at } }).eq("id", d.id); continue; }
        const buf = Buffer.from(await dl.data.arrayBuffer());
        const mime = (d.mime as string) || (String(d.filename).toLowerCase().endsWith(".pdf") ? "application/pdf" : "image/png");
        const out = await ocrMod.ocr(buf, mime);
        if (out && out.text.trim()) {
          const langs = out.langs.length ? out.langs : langMod.detectLangs(out.text);
          await admin.from("document").update({
            parsed_text: out.text,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            extracted: { ...prev, needsOcr: false, ocrTried: at, ocr: ocrMod.ocrProvenance(out, at), langs } as any,
          }).eq("id", d.id);
          done++;
          console.log(`  [ocr] ${d.id.slice(0, 8)} ${out.provider} ${langs.join("+")||"?"} conf=${out.confidence.toFixed(2)} ${out.text.length}ch`);
        } else {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await admin.from("document").update({ extracted: { ...prev, ocrTried: at, ocr: { provider: "none", langs: [], confidence: 0, at, failed: true } } as any }).eq("id", d.id);
        }
      } catch {
        await admin.from("document").update({ extracted: { ...prev, ocrTried: at } }).eq("id", d.id);
      }
    }
    return done;
  }

  // Synthesize drafts queued by the app (keyless prod). The pending draft_version
  // carries the full grounding in meta; we run the same provider-agnostic draft
  // synthesis and write the result back. Never sends/files — status → 'draft'.
  async function draftPending(): Promise<number> {
    const { data: vers } = await admin
      .from("draft_version")
      .select("id, tenant_id, draft_id, meta")
      .contains("meta", { pending: true })
      .limit(2); // each synth is a long (~120s) LLM call — keep the tick responsive
    if (!vers?.length) return 0;
    let done = 0;
    for (const v of vers) {
      const meta = (v.meta ?? {}) as { grounding?: unknown };
      if (!meta.grounding) continue;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await synthesizeDraft(meta.grounding as any);
      if (!result) continue; // no answer this tick — retry next loop
      await admin.from("draft_version").update({
        body: result.body, assumptions: result.assumptions, presumptions: result.presumptions,
        clarifications: result.clarifications, bullet_points: result.bullet_points,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        citations: result.citations as any, generated_by: "llm", meta: { done: true } as any,
      }).eq("id", v.id);
      await admin.from("draft").update({ status: "draft", updated_at: new Date().toISOString() }).eq("id", v.draft_id);
      done++;
      console.log(`  [draft] synthesized ${v.draft_id.slice(0, 8)} (${result.citations.length} cites, ${result.clarifications.length} clarifications)`);
    }
    return done;
  }

  // Answer Lawyer-Agent turns queued by the app (keyless prod has no synchronous
  // backend). The pending turn carries the question + retrieved hits in meta.
  async function answerPending(): Promise<number> {
    const { data: turns } = await admin
      .from("agent_turn")
      .select("id, tenant_id, meta")
      .eq("role", "assistant")
      .contains("meta", { pending: true })
      .limit(BATCH);
    if (!turns?.length) return 0;
    let done = 0;
    for (const t of turns) {
      const meta = (t.meta ?? {}) as { question?: string; hits?: unknown[] };
      if (!meta.question || !Array.isArray(meta.hits)) continue;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let hits = [...(meta.hits as any[])];
      // Semantic recall: embed the question, pull nearest matter-doc chunks (tenant-scoped).
      if (emb) {
        try {
          const qv = await emb.embedQuery(meta.question);
          const { data: matches } = await admin.rpc("match_document_chunks", { p_tenant: t.tenant_id, p_embedding: emb.toVectorLiteral(qv), p_k: 6 });
          for (const mrow of (matches ?? []) as { document_id: string; matter_id: string | null; content: string }[]) {
            hits.push({ source: "document", ref: "matter document", title: "Matter document (semantic match)", url: mrow.matter_id ? `/dashboard/cases/${mrow.matter_id}` : undefined, matterId: mrow.matter_id ?? undefined, snippet: (mrow.content || "").slice(0, 400) });
          }
        } catch { /* embeddings unavailable this tick → fall back to stored hits */ }
        const seen = new Set<string>();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        hits = hits.filter((h: any) => { const k = h.snippet || h.ref; if (seen.has(k)) return false; seen.add(k); return true; });
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ans = await synthesize(meta.question, hits as any);
      if (!ans) continue; // no answer this tick — retry next loop
      await admin
        .from("agent_turn")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update({ content: ans.answer, citations: ans.citations as any, meta: { done: true, abstained: ans.abstained } as any })
        .eq("id", t.id);
      done++;
      console.log(`  [agent] answered turn ${t.id.slice(0, 8)} (${ans.citations.length} cites)`);
    }
    return done;
  }

  // Generate AI briefings for cases that don't have one yet (background; uses our
  // Claude Code, so prod gets summaries without an API key / synchronous bridge).
  async function summarize(): Promise<number> {
    const { data: cases } = await admin
      .from("matter")
      .select("id, tenant_id, title, cnr, court, case_type, stage, status, next_hearing_date, parties")
      .is("ai_summary", null)
      .limit(BATCH);
    if (!cases?.length) return 0;
    let done = 0;
    for (const mt of cases) {
      const [{ data: hearings }, { data: docs }] = await Promise.all([
        admin.from("hearing").select("date, purpose, judge").eq("matter_id", mt.id).order("date", { ascending: false }),
        admin.from("document").select("filename, doc_type, parsed_text").eq("matter_id", mt.id),
      ]);
      const parties = (Array.isArray(mt.parties) ? mt.parties : []) as { name?: string; side?: string; advocate?: string }[];
      const prompt = buildCaseSummaryPrompt({
        title: mt.title, cnr: mt.cnr, court: mt.court, caseType: mt.case_type, stage: mt.stage,
        status: mt.status, nextHearingDate: mt.next_hearing_date, parties, hearings: hearings ?? [], documents: docs ?? [],
      });
      const summary = normalizeCaseSummary(await completeJson(prompt, CASE_SUMMARY_SCHEMA as unknown as Record<string, unknown>));
      if (summary) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await admin.from("matter").update({ ai_summary: summary as any }).eq("id", mt.id);
        done++;
        console.log(`  [summary] ${mt.title.slice(0, 48)}`);
      }
    }
    return done;
  }

  type Shortlist = { clients: { id: string; name: string }[]; matters: { id: string; title: string; cnr?: string | null }[] };

  async function pass(): Promise<number> {
    // Only rows never touched by a model (confidence = 0, the "off"-backend default).
    const { data: emails } = await admin
      .from("email_message")
      .select("id, tenant_id, subject, snippet, from_addr")
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
      const filing = await resolveFiling(admin, em.tenant_id, cls, { email: em.from_addr });
      if (filing.createdClient && cls.suggested_client_name) { sl.clients.push({ id: filing.clientId!, name: cls.suggested_client_name }); created++; }
      if (filing.createdMatter) { sl.matters.push({ id: filing.matterId!, title: cls.suggested_matter_title ?? "Case", cnr: cls.extracted.cnrs?.[0] ?? null }); created++; }

      const fileable = Boolean(filing.clientId || filing.matterId);
      const confident = cls.confidence >= THRESHOLD || filing.createdClient || filing.createdMatter || filing.matchedClientByContact;
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

  // Draft suggested replies for inbound client messages filed to a client/case.
  // The AI never auto-sends — this only fills msg_message.suggested_reply for the
  // advocate to review and send. Gated by WHATSAPP_SUGGEST_REPLIES (default on).
  async function suggestReplies(): Promise<number> {
    if (process.env.WHATSAPP_SUGGEST_REPLIES === "off") return 0;
    const { data: msgs } = await admin
      .from("msg_message")
      .select("id, tenant_id, client_id, matter_id, body")
      .eq("direction", "in")
      .is("suggested_reply", null)
      .not("body", "is", null)
      .or("client_id.not.is.null,matter_id.not.is.null")
      .limit(10);
    if (!msgs?.length) return 0;
    let done = 0;
    for (const m of msgs) {
      if (!m.body) continue;
      const reply = await suggestReply(admin, { tenantId: m.tenant_id, question: m.body, clientId: m.client_id, matterId: m.matter_id });
      if (reply) {
        await admin.from("msg_message").update({ suggested_reply: reply }).eq("id", m.id);
        done++;
      }
    }
    if (done) console.log(`  [reply] drafted ${done} suggested replies`);
    return done;
  }

  async function tick() {
    await pass();
    const o = await ocrPending();
    if (o) console.log(`documents OCR'd: ${o}`);
    const s = await summarize();
    if (s) console.log(`summaries generated: ${s}`);
    await embedDocuments();
    const a = await answerPending();
    if (a) console.log(`agent answers: ${a}`);
    const dr = await draftPending();
    if (dr) console.log(`drafts synthesized: ${dr}`);
    await suggestReplies();
  }

  if (process.argv.includes("--loop")) {
    console.log(`worker loop started (batch ${BATCH}, every ${INTERVAL_MS}ms)`);
    // eslint-disable-next-line no-constant-condition
    while (true) {
      await tick();
      await new Promise((r) => setTimeout(r, INTERVAL_MS));
    }
  } else {
    await tick();
  }
}

main().catch((e) => { console.error("worker error:", e); process.exit(1); });
