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
import { Reveal } from "../motion";

// WO-333 Wave 2 · EXACT-FIDELITY RECONCILE against design-mockups/iteration3/console/app.clients.tsx's
// `ClientsPage` — masthead copy/count style now matches the cases roster's already-reconciled
// convention (WO-331: honey mono numeral beside the title, not a neutral pill); the "Client" cell
// carries the reference's org-vs-individual glyph + a real second line (this client's own address,
// the honest analogue of the reference's dummy `city` — the schema has no separate city field); the
// Contact cell is the reference's two-line phone/email stack; "Cases"→"Matters" matches the
// reference's literal column label; the true empty state now uses the reference's `.ec-rule-left`
// treatment with BOTH its CTAs (Add client / Link from a case), not a generic centred empty-card.
// The reference's own "Show empty/configured state" DEV TOGGLE is dropped, as in every other
// reconciled Wave-2 page (see notifications/page.tsx, WO-336) — the real empty state is driven by
// `total`, never a manual flag. The reference's <Stamp> "CLIENT REGISTER" bar is a founder-directed
// omission for this WO. Bound to the real `client` table via clients-query.ts (RLS/tenant-scoped);
// `q` is a real ilike search, not the mockup's dummy data. The always-open "New client intake" card
// is the "+ Add client" modal (add-client-modal.tsx) — WO-347 rebuilt it into the reference's
// 2-step wizard (see that file's header comment for the full fidelity notes).
export default async function ClientsPage({ searchParams }: { searchParams: { page?: string; per?: string; q?: string } }) {
  const t = await getTranslations("clients");
  const td = await getTranslations("dashboard.clients");
  const supabase = createClient();
  const page = parsePage(searchParams.page);
  const per = clampPerPage(searchParams.per);
  const q = (searchParams.q ?? "").trim();

  const [{ rows: clients, total }, { data: areas }, { data: unlinkedMatters }] = await Promise.all([
    fetchClientsPage(supabase, page, per, q),
    supabase.from("practice_area").select("id, name").order("name"),
    // WO-347 · the "+ Add client" wizard's Step 2 "Link matters" typeahead — this tenant's
    // currently-uncliented matters (client_id IS NULL), the honest analogue of the reference's
    // fabricated CASE_INDEX. Bounded (a search-as-you-type helper, not a paginated list).
    supabase.from("matter").select("id, title, cnr").is("client_id", null).is("deleted_at", null).order("created_at", { ascending: false }).limit(200),
  ]);
  const matterOpts = (unlinkedMatters ?? []).map((m) => ({ id: m.id, label: m.cnr ? `${m.title} · ${m.cnr}` : m.title }));

  // Distinguish "no clients at all" (true empty state) from "no matches for this search"
  // (the roster + an inline no-results row) — never collapse the two into one fabricated copy.
  const showRoster = total > 0 || q.length > 0;

  return (
    <div className="space-y-6">
      {/* WO-342: dark ink engraved masthead — matches Overview/Directory's shipped treatment
          (today-view.tsx) instead of forking a light header; count moves into the honey mono
          pill on the ink-chip token (AppMasthead's title-slot count, design-mockups/iteration3/
          console/app-shell.tsx).
          WO-347 UNROUND: the reference's AppMasthead is a square, edge-to-edge ink band (no
          rounded corners) — `-mx-5 sm:-mx-8` cancels the shell's own `px-5 sm:px-8` content
          padding (dashboard/layout.tsx, untouched) so the band bleeds to the page edges, same
          bleed trick notifications/page.tsx already uses, minus the rounding it kept. */}
      <Reveal as="div" className="mk-engraved -mx-5 bg-ec-ink px-5 py-7 text-ec-paper sm:-mx-8 sm:px-8">
        <div className="flex flex-wrap items-baseline gap-3">
          <h1 className="font-display text-[28px] leading-tight text-ec-paper sm:text-[32px]">{t("title")}</h1>
          {total > 0 && (
            <span className="num rounded-md bg-ec-ink-chip px-2 py-0.5 font-mono text-[12px] text-ec-honey">{total}</span>
          )}
        </div>
        <p className="mt-1.5 text-[13px] text-ec-line-strong">{t("subtitle")}</p>
      </Reveal>

      <div className="flex flex-wrap items-center gap-2">
        <ClientsSearch initialQ={q} />
        {/* Reference: `{!empty && <button>Add client</button>}` — the roster's own trigger is
            hidden in the true-empty state, which carries its own "Add client" CTA instead. */}
        {showRoster && <AddClientButton practiceAreas={areas ?? []} matterOpts={matterOpts} />}
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
                  <th className="ec-label px-5 py-3">{td("colMatters")}</th>
                  <th className="ec-label hidden px-5 py-3 lg:table-cell">{td("lastActivity")}</th>
                  <th className="ec-label px-5 py-3">{t("colOutstanding")}</th>
                </tr>
              </thead>
              <tbody>
                {clients.map((c) => {
                  // Real analogue of the reference's dummy `city` line — the schema has no
                  // separate city field, so the client's own filed address fills the same slot.
                  const address = (c.custom as { address?: string } | null)?.address ?? null;
                  return (
                  <tr key={c.id} className="ec-row group border-b border-ec-hair last:border-0">
                    <td className="px-5 py-3.5">
                      <Link href={`/dashboard/clients/${c.id}`} className="flex min-w-0 items-center gap-2.5">
                        <Icon name={c.type === "org" ? "building" : "person"} className="h-3.5 w-3.5 shrink-0 text-ec-ink-3" />
                        <span className="min-w-0">
                          <span className="font-display block truncate text-[15px] text-ec-ink transition-colors group-hover:text-ec-bronze">{c.name}</span>
                          <span className="block truncate text-[11.5px] text-ec-muted-ink">{address ?? "—"}</span>
                        </span>
                      </Link>
                    </td>
                    <td className="hidden px-5 py-3.5 md:table-cell">
                      <div className="num min-w-0 font-mono text-[11.5px] text-ec-ink-2">
                        <div className="truncate">{c.phones?.[0] ?? "—"}</div>
                        {c.emails?.[0] && <div className="truncate text-ec-muted-ink">{c.emails[0]}</div>}
                      </div>
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
                    <td className="num px-5 py-3.5">
                      {c.outstandingMinor > 0 ? (
                        <span className="text-ec-ink">{fmtMoney(c.outstandingMinor)}</span>
                      ) : (
                        <span className="text-ec-ink-3">{td("settled")}</span>
                      )}
                    </td>
                  </tr>
                  );
                })}
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
        // Reference: `.rule-left` bronze-rule emphasis block with the eyebrow + display line +
        // two CTAs (Add client / Link from a case) — not a centred generic empty-card.
        <div className="ec-rule-left p-6">
          <p className="ec-label">{t("emptyTitle")}</p>
          <p className="mt-2 max-w-lg font-display text-[22px] leading-snug text-ec-ink">{t("emptyBody")}</p>
          <div className="mt-5 flex flex-wrap gap-2">
            <AddClientButton practiceAreas={areas ?? []} matterOpts={matterOpts} />
            <Link
              href="/dashboard/cases"
              className="inline-flex items-center gap-1.5 rounded-ec-s border border-ec-line-strong px-4 py-2.5 text-[13px] text-ec-ink-2 transition-colors hover:border-ec-bronze hover:text-ec-bronze"
            >
              {td("emptyLinkCase")} <Icon name="chevron" className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
