import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { Icon } from "@/components/icons";
import { Card } from "@/components/ui";
import { CourtDate, CourtField, EmptyCell, formatCourtDate } from "@/components/court";
import { CauseListUploader } from "./uploader";

export const metadata = { title: "Cause list · Mukadma" };

// ISO date helpers (server-side, no timezone surprises — use UTC).
function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}
function isoTomorrow(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

type CauseListEntry = {
  id: string;
  item_no: string | null;
  court: string | null;
  list_date: string;
  cnr: string | null;
  matter: { id: string; title: string } | null;
  advocate: { name: string } | null;
};

export default async function CauseListPage() {
  const t = await getTranslations("causeList");
  const tc = await getTranslations("common");

  const supabase = createClient();
  const today = isoToday();
  const tomorrow = isoTomorrow();

  // Fetch stored cause_list_entry rows for today + tomorrow.
  // Columns confirmed in database.types.ts: id, item_no, court, list_date, cnr, matter_id (→ matter), advocate_id (→ advocate).
  // judge + civ_cri are NOT separate columns — they may be in `raw` JSON, but `raw` is unstructured.
  // We surface what's confirmed: item_no, court, list_date, cnr, matter title, advocate name.
  const { data: entries } = await supabase
    .from("cause_list_entry")
    .select("id, item_no, court, list_date, cnr, matter:matter_id (id, title), advocate:advocate_id (name)")
    .in("list_date", [today, tomorrow])
    .order("list_date", { ascending: true })
    .order("item_no", { ascending: true });

  const rows = (entries ?? []) as unknown as CauseListEntry[];

  // Group by date label.
  const grouped = new Map<string, { label: string; rows: CauseListEntry[] }>();
  for (const r of rows) {
    const key = r.list_date;
    if (!grouped.has(key)) {
      grouped.set(key, {
        label: key === today ? t("board.today") : key === tomorrow ? t("board.tomorrow") : (formatCourtDate(key) ?? key),
        rows: [],
      });
    }
    grouped.get(key)!.rows.push(r);
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-[1.6rem] font-medium leading-tight tracking-tight text-ec-ink">{t("page.title")}</h1>
        <p className="mt-1 max-w-2xl text-sm text-ec-ink-3">{t("page.subtitle")}</p>
      </header>

      {/* ── Board: your cases listed today / tomorrow ── */}
      {grouped.size > 0 ? (
        <section aria-labelledby="board-heading" className="space-y-4">
          <h2 id="board-heading" className="text-sm font-semibold text-ec-ink">{t("board.heading")}</h2>
          {[...grouped.entries()].map(([date, group]) => (
            <Card key={date} className="overflow-hidden">
              {/* Date header */}
              <div className="flex items-center gap-3 border-b border-ec-hair bg-ec-brass-tint/30 px-5 py-3">
                <Icon name="calendar" className="h-4 w-4 shrink-0 text-ec-brass-deep" />
                <span className="font-semibold text-sm text-ec-ink">{group.label}</span>
                <span className="ml-auto text-xs text-ec-ink-3"><CourtDate value={date} emptyLabel={tc("states.notOnRecord")} /></span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-ec-hair text-left">
                      <th className="ec-label px-5 py-3">{t("board.th.item")}</th>
                      <th className="ec-label px-5 py-3">{t("board.th.matter")}</th>
                      <th className="ec-label hidden px-5 py-3 md:table-cell">{t("board.th.court")}</th>
                      <th className="ec-label hidden px-5 py-3 lg:table-cell">{t("board.th.cnr")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.rows.map((e) => (
                      <tr key={e.id} className="ec-row border-b border-ec-hair last:border-0 hover:bg-ec-hair/20">
                        <td className="num px-5 py-3 text-xs font-medium text-ec-ink">
                          {e.item_no ? `#${e.item_no}` : <EmptyCell label={tc("states.notOnRecord")} />}
                        </td>
                        <td className="px-5 py-3">
                          {e.matter ? (
                            <Link
                              href={`/dashboard/cases/${e.matter.id}`}
                              className="font-medium text-ec-ink hover:text-ec-indigo hover:underline"
                            >
                              {e.matter.title}
                            </Link>
                          ) : (
                            <span className="text-ec-ink-3">{e.cnr ?? t("board.unknownCase")}</span>
                          )}
                        </td>
                        <td className="hidden px-5 py-3 text-ec-ink-3 md:table-cell">
                          <CourtField value={e.court} field="court" emptyLabel={tc("states.notOnRecord")} />
                        </td>
                        <td className="hidden px-5 py-3 text-xs text-ec-ink-3 lg:table-cell num">
                          <CourtField value={e.cnr} field="cnr" emptyLabel={tc("states.notOnRecord")} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          ))}
        </section>
      ) : (
        // Real empty state — no rows for today/tomorrow. Not a fake board.
        <Card className="flex flex-col items-center justify-center px-6 py-12 text-center">
          <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-ec-m bg-ec-brass-tint text-ec-brass-deep">
            <Icon name="calendar" className="h-5 w-5" />
          </span>
          <h3 className="font-display text-base font-medium text-ec-ink">{t("board.empty.title")}</h3>
          <p className="mx-auto mt-1 max-w-sm text-sm text-ec-ink-3">{t("board.empty.body")}</p>
        </Card>
      )}

      {/* ── Uploader: parse & match a new cause list ── */}
      <section aria-labelledby="uploader-heading">
        <h2 id="uploader-heading" className="mb-3 text-sm font-semibold text-ec-ink">{t("uploader.heading")}</h2>
        <CauseListUploader />
      </section>

      <p className="flex items-center gap-1.5 text-xs text-ec-ink-3">
        <Icon name="alert" className="h-3.5 w-3.5" /> {tc("disclaimer")}
      </p>
    </div>
  );
}
