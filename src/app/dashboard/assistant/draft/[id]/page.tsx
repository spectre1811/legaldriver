import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Card, Badge } from "@/components/ui";
import { formatCourtDate } from "@/components/court";
import { Icon } from "@/components/icons";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/court/sync";
import { RegenerateButton, SectionsEditor, LanguageSelector, EditDraftForm, FinalizeButton, DiscardButton, PendingPoller } from "../draft-ui";

export const dynamic = "force-dynamic";

interface Citation { n: number; source: string; ref: string; title: string; url?: string }

export default async function DraftDetailPage({ params }: { params: { id: string } }) {
  const t = await getTranslations("draft");
  const supabase = createClient();
  const tenantId = await getTenantId(supabase);
  if (!tenantId) notFound();

  const { data: draft } = await supabase.from("draft").select("*").eq("id", params.id).maybeSingle();
  if (!draft) notFound();

  const [{ data: versions }, { data: doc }] = await Promise.all([
    supabase.from("draft_version").select("*").eq("draft_id", draft.id).order("version", { ascending: false }),
    draft.source_document_id
      ? supabase.from("document").select("filename, doc_type, parsed_text, mime, extracted").eq("id", draft.source_document_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const latest = versions?.[0] ?? null;
  const ocr = (doc?.extracted as { ocr?: { provider?: string; langs?: string[]; confidence?: number } } | null)?.ocr;
  const citations = (latest?.citations ?? []) as unknown as Citation[];
  const isPending = draft.status === "pending" || (!!latest?.meta && (latest.meta as { pending?: boolean }).pending === true);
  const hasBody = !!latest?.body?.trim();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/dashboard/assistant/draft" className="mb-1 inline-flex items-center gap-1.5 text-xs text-ink-muted hover:text-ink"><Icon name="back" className="h-3.5 w-3.5" /> {t("header")}</Link>
          <h1 className="text-[1.5rem] font-semibold leading-tight">{draft.title ?? t("draftFallback")}</h1>
          <p className="mt-1 text-sm text-ink-muted">{draft.produces_doc_type?.replace(/_/g, " ") ?? t("draftTypeFallback")} · {t("updated", { date: (formatCourtDate(draft.updated_at) ?? "—") })}</p>
        </div>
        <div className="flex items-center gap-3">
          <Badge tone={draft.status === "finalized" ? "green" : draft.status === "pending" ? "amber" : "brand"}>{draft.status}</Badge>
          <DiscardButton draftId={draft.id} />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* LEFT — source document */}
        <Card>
          <div className="flex items-center justify-between border-b border-line px-5 py-4">
            <p className="font-medium">{t("sourceDocument")}</p>
            {draft.matter_id && <Link href={`/dashboard/cases/${draft.matter_id}`} className="text-xs text-brand-600 hover:underline">{t("openCase")}</Link>}
          </div>
          <div className="space-y-3 px-5 py-5">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Icon name="documents" className="h-4 w-4 text-ink-faint" />
              <span className="font-medium">{doc?.filename ?? "—"}</span>
              {doc?.doc_type && <Badge tone="neutral">{doc.doc_type.replace(/_/g, " ")}</Badge>}
            </div>
            {ocr?.provider && (
              <p className="text-xs text-ink-faint">{t("ocrLabel")}: {ocr.provider}{ocr.langs?.length ? ` · ${ocr.langs.join("+")}` : ""}{typeof ocr.confidence === "number" ? ` · ${t("ocrConfidence")} ${ocr.confidence.toFixed(2)}` : ""}</p>
            )}
            <div className="max-h-[28rem] overflow-auto rounded-xl bg-paper p-4 text-sm leading-relaxed text-ink-soft whitespace-pre-wrap">
              {doc?.parsed_text?.trim() || t("noTextExtracted")}
            </div>
          </div>
        </Card>

        {/* RIGHT — the draft */}
        <Card>
          <div className="flex items-center justify-between border-b border-line px-5 py-4">
            <p className="font-medium">{t("draftLabel")}</p>
            <RegenerateButton draftId={draft.id} sections={draft.sections ?? []} has={hasBody} />
          </div>
          <div className="space-y-5 px-5 py-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <SectionsEditor draftId={draft.id} initial={draft.sections ?? []} />
              <LanguageSelector draftId={draft.id} current={draft.language ?? "en"} />
            </div>

            {isPending && !hasBody ? (
              <PendingPoller />
            ) : hasBody ? (
              <>
                {latest && latest.clarifications.length > 0 && (
                  <Section title={t("clarificationsNeeded")} tone="amber" icon="alert" items={latest.clarifications} />
                )}
                {latest && latest.assumptions.length > 0 && <Section title={t("assumptions")} icon="dot" items={latest.assumptions} />}
                {latest && latest.presumptions.length > 0 && <Section title={t("presumptions")} icon="scale" items={latest.presumptions} />}
                {latest && latest.bullet_points.length > 0 && <Section title={t("operativePoints")} icon="check" items={latest.bullet_points} />}

                <div>
                  <p className="label mb-2">{t("draftLabel")}</p>
                  <div className="max-h-[32rem] overflow-auto rounded-xl border border-line p-4 text-sm leading-relaxed whitespace-pre-wrap">{latest?.body}</div>
                </div>

                {citations.length > 0 && (
                  <div>
                    <p className="label mb-2">{t("citations")}</p>
                    <ol className="space-y-1 text-xs text-ink-muted">
                      {citations.map((c) => (
                        <li key={c.n}>[{c.n}] {c.title} — {c.ref}{c.url ? <> · <a href={c.url} target="_blank" rel="noreferrer" className="text-brand-600 hover:underline">{t("citationSource")}</a></> : null}</li>
                      ))}
                    </ol>
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
                  <EditDraftForm draftId={draft.id} body={latest?.body ?? ""} />
                  <FinalizeButton draftId={draft.id} />
                </div>
                <p className="text-xs text-ink-faint">{t("disclaimer")}</p>
              </>
            ) : (
              <p className="text-sm text-ink-muted">{t("noDraftYet")}</p>
            )}
          </div>
        </Card>
      </div>

      {versions && versions.length > 1 && (
        <Card>
          <div className="border-b border-line px-5 py-4"><p className="font-medium">{t("versionHistory")}</p></div>
          <ul className="divide-y divide-line text-sm">
            {versions.map((v) => (
              <li key={v.id} className="flex items-center justify-between px-5 py-2.5">
                <span>v{v.version} · {v.generated_by === "human-edit" ? t("yourEdit") : t("ai")}</span>
                <span className="text-xs text-ink-faint">{(formatCourtDate(v.created_at) ?? "—")}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function Section({ title, items, icon, tone }: { title: string; items: string[]; icon: "alert" | "dot" | "scale" | "check"; tone?: "amber" }) {
  return (
    <div className={tone === "amber" ? "rounded-xl bg-amber-50 px-4 py-3" : ""}>
      <p className={`label mb-1.5 ${tone === "amber" ? "text-amber-700" : ""}`}>{title}</p>
      <ul className="space-y-1">
        {items.map((s, i) => (
          <li key={i} className={`flex gap-2 text-sm ${tone === "amber" ? "text-amber-800" : "text-ink-soft"}`}>
            <Icon name={icon} className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {s}
          </li>
        ))}
      </ul>
    </div>
  );
}
