import { createClient } from "@/lib/supabase/server";
import { PageHeader, Card, Badge, fmtAgo, fmtDate } from "@/components/ui";
import { Icon } from "@/components/icons";
import { AdvocateForm } from "./advocate-form";
import { CourtRefreshForms } from "./court-gateway";
import { DeleteButton } from "@/components/delete-button";
import { deleteAdvocate } from "./actions";
import { getProviderHealth, getCacheStats } from "@/lib/court/gateway";

export default async function SettingsPage() {
  const supabase = createClient();
  const { data: advocates } = await supabase
    .from("advocate")
    .select("id, name, bar_registration_number, state_code")
    .order("name");

  // Cache + provider health come from the shared gateway (admin/service-role).
  // Refresh-request rows are tenant-scoped via RLS through createClient().
  const [health, stats, recent] = await Promise.all([
    getProviderHealth(),
    getCacheStats(),
    supabase
      .from("court_refresh_request")
      .select("id, cnr, status, note, created_at, fulfilled_at")
      .order("created_at", { ascending: false })
      .limit(8)
      .then((r) => r.data ?? []),
  ]);

  return (
    <div className="space-y-7">
      <PageHeader title="Settings" subtitle="Add advocates with their Bar Registration Number to pull their daily cause list." />

      <Card className="p-5">
        <h2 className="mb-4 text-base font-medium">Advocates</h2>
        <AdvocateForm />
        {advocates && advocates.length > 0 && (
          <ul className="mt-5 divide-y divide-line">
            {advocates.map((a) => (
              <li key={a.id} className="flex items-center justify-between py-3 text-sm">
                <span className="flex items-center gap-2.5 font-medium text-ink">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-50 text-xs font-semibold text-brand-700">
                    {a.name.slice(0, 1)}
                  </span>
                  {a.name}
                </span>
                <span className="flex items-center gap-3">
                  <span className="font-mono text-xs text-ink-faint">
                    {a.bar_registration_number ?? "—"}{a.state_code ? ` · ${a.state_code}` : ""}
                  </span>
                  <DeleteButton onDelete={deleteAdvocate.bind(null, a.id)} label="Remove" />
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="p-5">
        <div className="mb-4 flex items-start gap-2.5">
          <Icon name="scale" className="mt-0.5 h-5 w-5 text-ink-faint" />
          <div>
            <h2 className="text-base font-medium">Court data</h2>
            <p className="mt-0.5 text-sm text-ink-muted">
              Reads come from our shared cache first. If a provider errors, we fall back to
              the last good (stale) data rather than failing the request — resilience without
              scraping.
            </p>
          </div>
        </div>

        {/* Provider health */}
        <div className="rounded-xl border border-line">
          <div className="flex items-center justify-between px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-ink-faint">
            <span>Provider</span>
            <span>Status</span>
          </div>
          {health.length === 0 ? (
            <p className="border-t border-line px-4 py-3 text-sm text-ink-faint">
              No provider activity yet.
            </p>
          ) : (
            <ul className="divide-y divide-line">
              {health.map((h) => (
                <li key={h.provider} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                  <span className="flex items-center gap-2 font-mono text-ink">
                    <Icon name={h.ok ? "check" : "alert"} className={`h-4 w-4 ${h.ok ? "text-emerald-600" : "text-red-600"}`} />
                    {h.provider}
                  </span>
                  <span className="flex items-center gap-2.5 text-right">
                    {h.last_error && !h.ok && (
                      <span className="hidden max-w-[16rem] truncate text-xs text-ink-faint sm:inline" title={h.last_error}>
                        {h.last_error}
                      </span>
                    )}
                    <span className="text-xs text-ink-faint">
                      <Icon name="clock" className="mr-1 inline h-3 w-3" />
                      ok {fmtAgo(h.last_ok_at)}
                    </span>
                    <Badge tone={h.ok ? "green" : "red"}>{h.ok ? "OK" : "Down"}</Badge>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Cache stats */}
        <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-1 text-sm text-ink-muted">
          <span>
            <span className="font-semibold text-ink">{stats.cases}</span> cached case{stats.cases === 1 ? "" : "s"}
          </span>
          <span className="flex items-center gap-1.5">
            <Icon name="refresh" className="h-3.5 w-3.5" />
            Last refresh <span className="text-ink">{fmtAgo(stats.lastFetchedAt)}</span>
          </span>
        </div>

        {/* Refresh controls (provider button + HITL) */}
        <div className="mt-5">
          <CourtRefreshForms />
        </div>

        {/* Recent refresh requests */}
        {recent.length > 0 && (
          <div className="mt-5">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-faint">Recent refresh requests</p>
            <ul className="divide-y divide-line rounded-xl border border-line">
              {recent.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                  <span className="flex flex-col">
                    <span className="font-mono text-ink">{r.cnr}</span>
                    {r.note && <span className="text-xs text-ink-faint">{r.note}</span>}
                  </span>
                  <span className="flex items-center gap-2.5">
                    <span className="text-xs text-ink-faint">{fmtDate(r.created_at)}</span>
                    <Badge tone={r.status === "fulfilled" ? "green" : r.status === "cancelled" ? "neutral" : "amber"}>
                      {r.status}
                    </Badge>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <p className="mt-4 flex items-center gap-1.5 text-xs text-ink-faint">
          <Icon name="alert" className="h-3.5 w-3.5" />
          Source: eCourts. Court data is informational — verify against the official record.
        </p>
      </Card>

      <Card className="flex items-start gap-3 p-5">
        <Icon name="gmail" className="mt-0.5 h-5 w-5 text-ink-faint" />
        <div className="text-sm text-ink-muted">
          <p className="font-medium text-ink">Connections</p>
          <p className="mt-0.5">Connect Gmail from the <span className="text-brand-600">Inbox</span> to auto-file emails and attachments against the right client and case.</p>
        </div>
      </Card>
    </div>
  );
}
