import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { fmtMoney, fmtAgo } from "@/components/ui";
import { Icon } from "@/components/icons";
import { AddClientButton } from "./add-client-modal";
import { ClientsSearch } from "./clients-search";
import { Pagination } from "@/components/pagination";
import { fetchClientsPage } from "./clients-query";
import { parsePage, clampPerPage } from "@/lib/paginate";

// WO-333 · Clients console page → Daybreak/Chambers. Reskins the roster onto the WO-328 shell
// using the `ec-*` token classes the sibling Wave-2 pages (cases/documents/calendar) already
// established — same primitives, no new global CSS. Bound to the real `client` table via
// clients-query.ts (RLS/tenant-scoped); `q` is a real ilike search, not the mockup's dummy data.
// The always-open "New client intake" card is now the "+ Add client" modal (add-client-modal.tsx)
// wrapping the SAME ClientIntake form unmodified.
export default async function ClientsPage({ searchParams }: { searchParams: { page?: string; per?: string; q?: string } }) {
  const t = await getTranslations("clients");
  const td = await getTranslations("dashboard.clients");
  const supabase = createClient();
  const page = parsePage(searchParams.page);
  const per = clampPerPage(searchParams.per);
  const q = (searchParams.q ?? "").trim();

  const [{ rows: clients, total }, { data: areas }] = await Promise.all([
    fetchClientsPage(supabase, page, per, q),
    supabase.from("practice_area").select("id, name").order("name"),
  ]);

  // Distinguish "no clients at all" (true empty state) from "no matches for this search"
  // (the roster + an inline no-results row) — never collapse the two into one fabricated copy.
  const showRoster = total > 0 || q.length > 0;

  return (
    <div className="space-y-6">
      <header>
        <div className="flex items-center gap-2.5">
          <h1 className="font-display text-[1.6rem] font-medium leading-tight tracking-tight text-ec-ink">{t("title")}</h1>
          {total > 0 && <span className="num rounded-ec-s bg-ec-paper-3 px-2 py-0.5 text-sm text-ec-ink-3">{total}</span>}
        </div>
        <p className="mt-1 max-w-2xl text-sm text-ec-ink-3">{t("subtitle")}</p>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <ClientsSearch initialQ={q} />
        <AddClientButton practiceAreas={areas ?? []} />
      </div>

      {showRoster ? (
        <>
          <div className="ec-card overflow-hidden">
            <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ec-hair text-left">
                  <th className="ec-label px-5 py-3">{t("colClient")}</th>
                  <th className="ec-label hidden px-5 py-3 md:table-cell">{t("colContact")}</th>
                  <th className="ec-label px-5 py-3">{t("colCases")}</th>
                  <th className="ec-label hidden px-5 py-3 lg:table-cell">{td("lastActivity")}</th>
                  <th className="ec-label px-5 py-3 text-right">{t("colOutstanding")}</th>
                </tr>
              </thead>
              <tbody>
                {clients.map((c) => (
                  <tr key={c.id} className="ec-row border-b border-ec-hair last:border-0">
                    <td className="px-5 py-3.5">
                      <Link href={`/dashboard/clients/${c.id}`} className="font-display text-ec-ink hover:text-ec-bronze">
                        {c.name}
                      </Link>
                      <div className="mt-0.5 flex items-center gap-1.5">
                        <span className="ec-chip">{c.type === "org" ? t("intake.typeOrg") : t("intake.typeIndividual")}</span>
                        {c.practiceArea && <span className="text-[11.5px] text-ec-ink-3">{c.practiceArea}</span>}
                      </div>
                    </td>
                    <td className="hidden px-5 py-3.5 text-ec-ink-2 md:table-cell">
                      <span className="num">{c.phones?.[0] ?? c.emails?.[0] ?? "—"}</span>
                    </td>
                    <td className="num px-5 py-3.5 text-ec-ink-2">{c.caseCount}</td>
                    <td className="hidden px-5 py-3.5 text-ec-ink-3 lg:table-cell">
                      {c.lastActivity ? (
                        <span title={c.lastActivity.summary} className="block max-w-[220px] truncate">
                          {c.lastActivity.summary} · <span className="num">{fmtAgo(c.lastActivity.at)}</span>
                        </span>
                      ) : (
                        <span className="text-ec-ink-3">{td("noActivity")}</span>
                      )}
                    </td>
                    <td className="num px-5 py-3.5 text-right">
                      {c.outstandingMinor > 0 ? (
                        <span className="text-ec-ink">{fmtMoney(c.outstandingMinor)}</span>
                      ) : (
                        <span className="text-ec-ink-3">{td("settled")}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
            {clients.length === 0 && (
              <p className="px-5 py-10 text-center text-sm text-ec-ink-3">{td("noMatches", { q })}</p>
            )}
          </div>
          <Pagination page={page} perPage={per} total={total} />
        </>
      ) : (
        <div className="ec-card flex flex-col items-center gap-3 px-6 py-16 text-center">
          <span className="rounded-full bg-ec-paper-3 p-3 text-ec-ink-3"><Icon name="clients" className="h-6 w-6" /></span>
          <p className="font-display text-lg text-ec-ink">{t("emptyTitle")}</p>
          <p className="max-w-sm text-sm text-ec-ink-3">{t("emptyBody")}</p>
        </div>
      )}
    </div>
  );
}
