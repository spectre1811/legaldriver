import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { PageHeader, Card, Stat, EmptyState } from "@/components/ui";
import { formatCourtDate } from "@/components/court";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/court/sync";
import { fetchPortfolio, OPEN_SCAN_CAP, type PortfolioMatter } from "./portfolio-query";

export const dynamic = "force-dynamic";

const iso = (d: Date) => d.toISOString().slice(0, 10);
const plusDays = (n: number) => { const x = new Date(); x.setUTCDate(x.getUTCDate() + n); return iso(x); };
const daysBetween = (a: string, b: string) => Math.round((new Date(a).getTime() - new Date(b).getTime()) / 86400000);

// Firm-wide "managing partner" view — turns per-case court data into portfolio risk.
export default async function PortfolioPage() {
  const supabase = createClient();
  const t = await getTranslations("portfolio");
  const tenantId = await getTenantId(supabase);
  const today = iso(new Date());

  // WO-56: bounded + indexed (see portfolio-query.ts) — no more fetch-all matter/document
  // scans. `open` is the tenant's open caseload (capped, soonest-hearing first); the
  // effective-date coalesce + risk buckets are computed over it below.
  const [{ open, latestDocByMatter: latestDoc, capped }, { data: deadlines }] = tenantId
    ? await Promise.all([
        fetchPortfolio(supabase, tenantId, today, plusDays(7)),
        supabase.from("deadline").select("id, matter_id, kind, due_date, jurisdiction_rule").eq("tenant_id", tenantId).eq("status", "open").gte("due_date", today).lte("due_date", plusDays(15)).order("due_date"),
      ])
    : [{ open: [] as PortfolioMatter[], latestDocByMatter: new Map<string, string>(), capped: false }, { data: [] }];

  const eff = (m: PortfolioMatter) => m.next_hearing_override ?? m.next_hearing_date;
  const titleOf = new Map(open.map((m) => [m.id, m.title] as const));

  const upcoming = open.filter((m) => { const e = eff(m); return e && e >= today && e <= plusDays(30); }).sort((a, b) => (eff(a)! < eff(b)! ? -1 : 1));
  const atRisk = upcoming.filter((m) => { const e = eff(m)!; if (daysBetween(e, today) > 7) return false; const ld = latestDoc.get(m.id); return !ld || daysBetween(today, ld.slice(0, 10)) > 14; });
  const pastDue = open.filter((m) => { const e = eff(m); return e && e < today; }).sort((a, b) => (eff(b)! < eff(a)! ? -1 : 1));
  const needsRefresh = open.filter((m) => m.cnr && (!m.last_synced_at || daysBetween(today, m.last_synced_at.slice(0, 10)) > 10));

  const card = (title: string, hint: string, children: React.ReactNode) => (
    <Card>
      <div className="border-b border-line px-5 py-4"><h2 className="text-base font-medium">{title}</h2><p className="mt-0.5 text-xs text-ink-faint">{hint}</p></div>
      {children}
    </Card>
  );
  const row = (mid: string, primary: React.ReactNode, right: React.ReactNode, tone?: "amber" | "red") => (
    <li key={mid + String(right)} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
      <Link href={`/dashboard/cases/${mid}`} className="min-w-0 flex-1 truncate font-medium text-brand-600 hover:underline">{primary}</Link>
      <span className={`shrink-0 text-xs ${tone === "red" ? "font-medium text-red-600" : tone === "amber" ? "text-amber-700" : "text-ink-faint"}`}>{right}</span>
    </li>
  );

  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} subtitle={t("subtitle")} />

      {capped && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-800" role="status">
          {t("capped", { count: OPEN_SCAN_CAP })}
        </p>
      )}

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Stat label={t("stat.openCases")} value={String(open.length)} />
        <Stat label={t("stat.hearings7d")} value={String(upcoming.filter((m) => daysBetween(eff(m)!, today) <= 7).length)} />
        <Stat label={t("stat.atRisk")} value={String(atRisk.length)} />
        <Stat label={t("stat.deadlines15d")} value={String((deadlines ?? []).length)} />
        <Stat label={t("stat.pastDue")} value={String(pastDue.length)} />
      </section>

      {card(t("cards.atRisk.title"), t("cards.atRisk.hint"),
        atRisk.length ? <ul className="divide-y divide-line">{atRisk.map((m) => row(m.id, m.title, t("hearingOn", { date: formatCourtDate(eff(m)) ?? "—" }), "red"))}</ul>
          : <EmptyState icon="check" title={t("empty.atRisk.title")} body={t("empty.atRisk.body")} />)}

      {card(t("cards.upcoming.title"), t("cards.upcoming.hint"),
        upcoming.length ? <ul className="divide-y divide-line">{upcoming.slice(0, 40).map((m) => { const dd = daysBetween(eff(m)!, today); return row(m.id, <>{m.title}{m.cnr ? <span className="ml-2 font-mono text-xs text-ink-faint">{m.cnr}</span> : null}</>, `${formatCourtDate(eff(m)) ?? "—"} · ${dd === 0 ? t("today") : t("inDays", { d: dd })}`, dd <= 3 ? "amber" : undefined); })}</ul>
          : <EmptyState icon="calendar" title={t("empty.upcoming.title")} body={t("empty.upcoming.body")} />)}

      {card(t("cards.deadlines.title"), t("cards.deadlines.hint"),
        (deadlines ?? []).length ? <ul className="divide-y divide-line">{(deadlines ?? []).map((d) => row(d.matter_id ?? "", <>{d.kind.replace(/_/g, " ")} — {titleOf.get(d.matter_id ?? "") ?? t("caseFallback")}{d.jurisdiction_rule ? <span className="text-ink-faint"> · {d.jurisdiction_rule}</span> : null}</>, `${(formatCourtDate(d.due_date) ?? "—")} · ${t("inDays", { d: daysBetween(d.due_date, today) })}`, daysBetween(d.due_date, today) <= 3 ? "red" : "amber"))}</ul>
          : <EmptyState icon="check" title={t("empty.deadlines.title")} />)}

      <div className="grid gap-6 lg:grid-cols-2">
        {card(t("cards.pastDue.title"), t("cards.pastDue.hint"),
          pastDue.length ? <ul className="divide-y divide-line">{pastDue.slice(0, 25).map((m) => row(m.id, m.title, t("wasOn", { date: formatCourtDate(eff(m)) ?? "—" }), "amber"))}</ul>
            : <EmptyState icon="check" title={t("empty.pastDue.title")} />)}

        {card(t("cards.needsRefresh.title"), t("cards.needsRefresh.hint"),
          needsRefresh.length ? <ul className="divide-y divide-line">{needsRefresh.slice(0, 25).map((m) => row(m.id, m.title, m.last_synced_at ? t("daysAgo", { d: daysBetween(today, m.last_synced_at.slice(0, 10)) }) : t("never")))}</ul>
            : <EmptyState icon="check" title={t("empty.needsRefresh.title")} />)}
      </div>

      <p className="text-xs text-ink-faint">{t("footer")}</p>
    </div>
  );
}
