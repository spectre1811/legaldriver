import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui";
import { Icon } from "@/components/icons";
import { whyKey } from "@/lib/docs/review-why";
import { ReviewInbox, type ReviewDoc } from "./review-inbox";

// WO-33 Wave 1 — the Review Inbox surface. A document needs review if it's explicitly flagged
// (`extracted.status = 'needs_review'`, from a low-confidence upload) OR it's simply unfiled
// (no client and no case) — the email-orphaned + never-filed docs that had no home before.
export default async function DocumentReviewPage() {
  const t = await getTranslations("documents.review");
  const td = await getTranslations("documents");
  const supabase = createClient();

  const [{ data: docs }, { data: clients }, { data: matters }] = await Promise.all([
    supabase
      .from("document")
      .select("id, filename, doc_type, source, client_id, matter_id, extracted, created_at")
      .filter("extracted->>deletedAt", "is", null)
      .or("extracted->>status.eq.needs_review,and(client_id.is.null,matter_id.is.null)")
      .order("created_at", { ascending: false })
      .limit(200),
    supabase.from("client").select("id, name"),
    supabase.from("matter").select("id, title"),
  ]);

  const SOURCE: Record<string, string> = { gmail: td("source.gmail"), upload: td("source.upload"), court_order: td("source.courtOrder") };
  const clientOpts = (clients ?? []).map((c) => ({ id: c.id, label: c.name }));
  const matterOpts = (matters ?? []).map((m) => ({ id: m.id, label: m.title }));

  const reviewDocs: ReviewDoc[] = (docs ?? []).map((d) => {
    const ex = (d.extracted ?? {}) as Record<string, unknown>;
    const cnrs = Array.isArray(ex.cnrs) ? (ex.cnrs as string[]) : [];
    const parties = Array.isArray(ex.parties) ? (ex.parties as string[]) : [];
    const wk = whyKey({ cnrs, source: d.source, parties });
    const why =
      wk === "cnr" ? t("whyCnr", { cnr: cnrs[0] })
        : wk === "email" ? t("whyEmail")
          : wk === "party" ? t("whyParty", { party: parties[0] })
            : null;
    // WO-33 W4: the audit re-scan parks a fresh fuzzy match in `refileSuggest*` (it doesn't touch
    // the filing). Prefer it as the pre-filled proposal when the doc has no filing of its own, so a
    // doc that couldn't match at ingest shows the now-matchable client/case for one-tap confirm.
    const suggestClientId = typeof ex.refileSuggestClientId === "string" ? (ex.refileSuggestClientId as string) : null;
    const suggestMatterId = typeof ex.refileSuggestMatterId === "string" ? (ex.refileSuggestMatterId as string) : null;
    return {
      id: d.id,
      filename: d.filename ?? "—",
      docType: d.doc_type,
      confidence: typeof ex.confidence === "number" ? (ex.confidence as number) : null,
      summary: typeof ex.summary === "string" ? (ex.summary as string) : null,
      parties,
      cnrs,
      sourceLabel: SOURCE[d.source] ?? d.source,
      proposedClientId: d.client_id ?? suggestClientId,
      proposedMatterId: d.matter_id ?? suggestMatterId,
      refiled: Boolean(suggestClientId || suggestMatterId),
      suggestedClientName: typeof ex.suggestedClientName === "string" ? (ex.suggestedClientName as string) : null,
      suggestedMatterTitle: typeof ex.suggestedMatterTitle === "string" ? (ex.suggestedMatterTitle as string) : null,
      why,
    };
  });

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <PageHeader title={t("title")} subtitle={t("subtitle")} />
        <Link href="/dashboard/documents" className="btn-ghost shrink-0 text-sm">
          <Icon name="back" className="h-4 w-4" />
          <span className="ml-1.5">{t("back")}</span>
        </Link>
      </div>
      <ReviewInbox docs={reviewDocs} clients={clientOpts} matters={matterOpts} />
    </div>
  );
}
