import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { PageHeader, Card, Badge, EmptyState, fmtDate } from "@/components/ui";
import { Icon } from "@/components/icons";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/court/sync";
import { UploadAndDraftForm } from "./draft-ui";

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, "neutral" | "brand" | "green" | "amber"> = {
  pending: "amber", draft: "brand", edited: "brand", finalized: "green", discarded: "neutral",
};

export default async function DraftConsolePage() {
  const t = await getTranslations("draft");
  const supabase = createClient();
  const tenantId = await getTenantId(supabase);

  const { data: drafts } = tenantId
    ? await supabase
        .from("draft")
        .select("id, title, status, produces_doc_type, created_at, updated_at, source_document_id, document:source_document_id(filename)")
        .neq("status", "discarded")
        .order("updated_at", { ascending: false })
        .limit(50)
    : { data: [] };

  return (
    <div className="space-y-6">
      <PageHeader title={t("header")} subtitle={t("subtitle")} />

      <Card>
        <div className="border-b border-line px-5 py-4">
          <p className="font-medium">{t("startNewDraft")}</p>
          <p className="mt-0.5 text-sm text-ink-muted">{t("startNewDraftHint")}</p>
        </div>
        <div className="px-5 py-5">
          <UploadAndDraftForm />
          <p className="mt-3 text-xs text-ink-faint">{t("alsoDraftHint")}</p>
        </div>
      </Card>

      <Card>
        <div className="border-b border-line px-5 py-4"><p className="font-medium">{t("yourDrafts")}</p></div>
        {drafts && drafts.length > 0 ? (
          <ul className="divide-y divide-line">
            {drafts.map((d) => {
              const doc = d.document as { filename?: string } | null;
              return (
                <li key={d.id}>
                  <Link href={`/dashboard/draft/${d.id}`} className="flex items-center justify-between gap-3 px-5 py-3.5 hover:bg-paper">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{d.title ?? t("draftFallback")}</p>
                      <p className="truncate text-xs text-ink-muted">
                        {d.produces_doc_type?.replace(/_/g, " ") ?? t("draftTypeFallback")}
                        {doc?.filename ? ` · ${t("inReplyTo", { filename: doc.filename })}` : ""} · {fmtDate(d.updated_at)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <Badge tone={STATUS_TONE[d.status] ?? "neutral"}>{d.status}</Badge>
                      <Icon name="chevron" className="h-4 w-4 text-ink-faint" />
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState icon="edit" title={t("emptyTitle")} body={t("emptyBody")} />
        )}
      </Card>
    </div>
  );
}
