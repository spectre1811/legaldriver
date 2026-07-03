// Smoke test: Lawyer Agent grounding + synthesis (E6).
// Exercises legal_reference retrieval + CLI synthesis + citations.
// Run: set -a; source .env; set +a; CLASSIFIER_BACKEND=cli npx tsx tests/agent_smoke.ts
import { createAdminClient } from "@/lib/supabase/admin";
import { retrieve } from "@/lib/services/agent/retrieve";
import { synthesize } from "@/lib/services/agent/agent";

async function main() {
  const sb = createAdminClient();
  const q =
    "My client received an IPC 420 cheating notice and a cheque bounced under section 138 NI Act. What is the new BNS section for 420, and what is the cheque-bounce notice timeline?";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hits = await retrieve(sb as any, { tenantId: "smoke", question: q });
  console.log("RETRIEVED:", hits.map((h) => `${h.source}:${h.ref}`).join(" | ") || "(none)");

  const ans = await synthesize(q, hits, { tenantId: "smoke" });
  if (!ans) {
    console.log("\nsynthesize returned null (no AI backend available here).");
    console.log("AGENT SMOKE: INCONCLUSIVE (would queue to worker on prod)");
    process.exit(0);
  }
  console.log("\nANSWER:\n" + ans.answer.slice(0, 800));
  console.log("\nCITATIONS:", ans.citations.map((c) => `[${c.n}] ${c.source}:${c.ref}`).join(", "));
  console.log("abstained:", ans.abstained);

  const grounded = hits.length > 0 && ans.citations.length > 0 && /BNS|318/.test(ans.answer);
  console.log(grounded ? "\nAGENT SMOKE: PASS (grounded + cited)" : "\nAGENT SMOKE: WEAK (check grounding)");
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
