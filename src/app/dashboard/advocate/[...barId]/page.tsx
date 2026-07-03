import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PageHeader, Card, Badge, EmptyState } from "@/components/ui";
import { Icon } from "@/components/icons";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/court/sync";
import { getAdvocateProfile, ldEnabled } from "@/lib/court/legaldriver-api";
import { TrackCaseButton } from "@/components/track-case-button";

export const dynamic = "force-dynamic";

const TIER_TONE: Record<string, "brand" | "neutral"> = { HIGH: "brand", DISTRICT: "neutral" };

// Browsable advocate caseload from the live LegalDriver API (/advocate/{bar_id}).
// Catch-all route: bar_id is numeric (HC) OR slash-form "G/NN/YYYY" (district), which
// arrives as multiple path segments — rejoin them.
export default async function AdvocatePage({ params }: { params: { barId: string[] } }) {
  if (!ldEnabled()) notFound();
  const t = await getTranslations("advocate");
  const barId = params.barId.map(decodeURIComponent).join("/");
  const profile = await getAdvocateProfile(barId);
  if (!profile) notFound();

  // Which of these CNRs does the firm already track? (link straight to the matter).
  const supabase = createClient();
  const tenantId = await getTenantId(supabase);
  const cnrs = profile.cases.map((c) => c.cnr).filter(Boolean);
  const { data: tracked } = tenantId && cnrs.length
    ? await supabase.from("matter").select("id, cnr").eq("tenant_id", tenantId).in("cnr", cnrs)
    : { data: [] };
  const byCnr = new Map((tracked ?? []).map((m) => [m.cnr, m.id]));

  const pending = profile.cases.filter((c) => (c.status ?? "").toUpperCase() === "PENDING").length;

  return (
    <div className="space-y-6">
      <PageHeader title={profile.names[0] ?? t("nameFallback", { barId: profile.bar_id })} subtitle={`${t("subtitle", { barId: profile.bar_id })}${profile.names.length > 1 ? ` ${t("alsoKnownAs", { names: profile.names.slice(1).join(", ") })}` : ""}`} />

      <section className="grid grid-cols-3 gap-3">
        <Card><div className="px-4 py-3"><p className="label">{t("totalCases")}</p><p className="text-2xl font-semibold">{profile.case_count}</p></div></Card>
        <Card><div className="px-4 py-3"><p className="label">{t("pending")}</p><p className="text-2xl font-semibold">{pending}</p></div></Card>
        <Card><div className="px-4 py-3"><p className="label">{t("disposed")}</p><p className="text-2xl font-semibold">{profile.case_count - pending}</p></div></Card>
      </section>

      <Card>
        <div className="border-b border-line px-5 py-4"><p className="font-medium">{t("caseload")} <span className="text-ink-faint">{t("showing", { count: profile.cases.length })}</span></p></div>
        {profile.cases.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-ink-faint"><th className="px-5 py-2 font-medium">{t("colCnr")}</th><th className="px-3 py-2 font-medium">{t("colType")}</th><th className="px-3 py-2 font-medium">{t("colSide")}</th><th className="px-3 py-2 font-medium">{t("colStatus")}</th><th className="px-3 py-2 font-medium">{t("colCourt")}</th><th className="px-3 py-2"></th></tr></thead>
              <tbody>
                {profile.cases.map((c) => {
                  const mid = byCnr.get(c.cnr);
                  return (
                    <tr key={c.cnr} className="border-t border-line">
                      <td className="px-5 py-2 font-mono text-xs">{mid ? <Link href={`/dashboard/cases/${mid}`} className="text-brand-600 hover:underline">{c.cnr}</Link> : c.cnr}</td>
                      <td className="px-3 py-2 text-ink-soft">{c.case_type}{c.registration_year ? ` (${c.registration_year})` : ""}</td>
                      <td className="px-3 py-2 text-ink-muted">{c.side}</td>
                      <td className="px-3 py-2"><Badge tone={(c.status ?? "").toUpperCase() === "PENDING" ? "amber" : "green"}>{c.status}</Badge></td>
                      <td className="px-3 py-2"><Badge tone={TIER_TONE[c.tier ?? ""] ?? "neutral"}>{c.tier}</Badge></td>
                      <td className="px-3 py-2 text-right">{mid ? <span className="text-xs text-ink-faint">{t("tracked")}</span> : <TrackCaseButton cnr={c.cnr} />}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState icon="scale" title={t("emptyTitle")} body={t("emptyBody")} />
        )}
        <p className="px-5 py-3 text-xs text-ink-faint">{t("sourceNote")}</p>
      </Card>
    </div>
  );
}
