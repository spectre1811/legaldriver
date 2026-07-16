import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { Icon } from "@/components/icons";
import { EmptyCell, Disclaimer } from "@/components/court";
import { CauseListUploader } from "./uploader";
import { PrintButton } from "./print-button";

export const metadata = { title: "Cause lists · Mukadma" };

// ISO date helpers (server-side, UTC — no timezone surprises).
function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return isoDate(d);
}
function isValidIso(s?: string): s is string {
  return !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
}
// Numeric-aware item sort; non-numeric / null sink to the bottom.
function itemNum(s: string | null): number {
  const n = parseInt(s ?? "", 10);
  return Number.isNaN(n) ? Number.MAX_SAFE_INTEGER : n;
}

type Entry = {
  id: string;
  item_no: string | null;
  court: string | null;
  list_date: string;
  cnr: string | null;
  matter: { id: string; title: string } | null;
};

export default async function CauseListPage({ searchParams }: { searchParams: { date?: string } }) {
  const t = await getTranslations("causeList");
  const tc = await getTranslations("common");
  const locale = await getLocale();

  const today = isoDate(new Date());
  const selected = isValidIso(searchParams.date) ? searchParams.date : today;
  const prev = addDays(selected, -1);
  const next = addDays(selected, 1);

  const supabase = createClient();
  // Confirmed columns (database.types.ts): item_no, court, list_date, cnr, matter_id (→ matter).
  // judge / stage / case-number are NOT columns — those reference elements drop (see INBOX API asks).
  const { data } = await supabase
    .from("cause_list_entry")
    .select("id, item_no, court, list_date, cnr, matter:matter_id (id, title)")
    .eq("list_date", selected)
    .order("court", { ascending: true });

  const rows = ((data ?? []) as unknown as Entry[]).sort(
    (a, b) => (a.court ?? "").localeCompare(b.court ?? "") || itemNum(a.item_no) - itemNum(b.item_no),
  );

  // Group by court, preserving the sorted order.
  const groups = new Map<string, Entry[]>();
  for (const r of rows) {
    const key = r.court ?? "";
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(r);
  }

  // Day-level summary (honest, over the whole day). "Yours" = matched to one of your matters.
  const mine = rows.filter((r) => r.matter);
  const mineCount = mine.length;
  const earliest = mine.reduce<string | null>((min, r) => {
    if (!r.item_no) return min;
    return min === null || itemNum(r.item_no) < itemNum(min) ? r.item_no : min;
  }, null);

  // Localized date label for the stepper (mono, uppercased Latin).
  const dateLabel = new Date(`${selected}T00:00:00Z`).toLocaleDateString(locale === "hi" ? "hi-IN" : "en-IN", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  });

  return (
    <div className="space-y-5">
      <header>
        <h1 className="font-display text-[1.7rem] font-medium leading-tight tracking-tight text-ec-ink">{t("page.title")}</h1>
        <p className="mt-1 max-w-2xl text-sm text-ec-ink-3">{t("page.subtitle")}</p>
      </header>

      {/* ── Selector well (labeled) — real date stepper + print. Bench/roster/judge drop: no data source. ── */}
      <div className="rounded-ec-s border border-ec-hair bg-ec-paper-3 p-4 print:hidden">
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-1.5">
            <span className="ec-label">{t("well.dateLabel")}</span>
            <div className="flex items-center gap-1 rounded-ec-s border border-ec-hair bg-ec-paper-2 px-1 py-0.5" role="group" aria-label={t("well.dateLabel")}>
              <Link
                href={`/dashboard/cause-list?date=${prev}`}
                aria-label={t("well.prevDay")}
                className="grid h-7 w-7 place-items-center rounded-ec-s text-ec-ink-3 hover:bg-ec-paper-3 hover:text-ec-ink"
              >
                <Icon name="back" className="h-3.5 w-3.5" />
              </Link>
              <Link
                href="/dashboard/cause-list"
                aria-label={t("well.jumpToday")}
                className="num px-2 text-[11.5px] uppercase tracking-[0.08em] text-ec-ink"
              >
                {selected === today ? `${t("well.today")} · ` : ""}
                {dateLabel}
              </Link>
              <Link
                href={`/dashboard/cause-list?date=${next}`}
                aria-label={t("well.nextDay")}
                className="grid h-7 w-7 place-items-center rounded-ec-s text-ec-ink-3 hover:bg-ec-paper-3 hover:text-ec-ink"
              >
                <Icon name="chevron" className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>

          <div className="ml-auto self-end">
            <PrintButton />
          </div>
        </div>
      </div>

      {rows.length === 0 ? (
        // Real empty state — no listings for the selected day (comms-catalog §6 diary voice).
        <div className="grid min-h-[240px] place-items-center rounded-ec-s border border-dashed border-ec-hair bg-ec-paper-2/50 text-center">
          <div>
            <p className="font-display text-lg text-ec-ink">{t("boardEmpty.title")}</p>
            <p className="mt-1 text-sm text-ec-ink-3">{t("boardEmpty.body")}</p>
          </div>
        </div>
      ) : (
        <>
          {/* ── Sticky summary strip (day-level, data-bound) ── */}
          <div
            role="status"
            aria-live="polite"
            className="sticky top-0 z-10 rounded-ec-s border border-ec-hair bg-ec-paper-2/85 px-3 py-2 text-[12px] text-ec-ink-2 backdrop-blur"
          >
            {t("summary.yours")}: <span className="num text-ec-ink">{mineCount}</span>
            {earliest && (
              <>
                {" · "}
                {t("summary.earliest", { item: earliest })}
              </>
            )}
          </div>

          {/* ── Court-grouped board with sand bands ── */}
          <div className="space-y-5">
            {[...groups.entries()].map(([court, groupRows]) => (
              <section key={court || "unassigned"} aria-label={court || t("group.unassigned")}>
                <div className="flex items-baseline justify-between rounded-t-ec-s border border-ec-hair bg-ec-paper-3 px-4 py-2.5">
                  <h2 className="min-w-0 truncate font-display text-[15px] text-ec-ink">{court || t("group.unassigned")}</h2>
                  <span className="num shrink-0 pl-3 text-[11px] text-ec-ink-2">{t("group.itemsListed", { count: groupRows.length })}</span>
                </div>

                <ul className="divide-y divide-ec-hair overflow-hidden rounded-b-ec-s border-x border-b border-ec-hair bg-ec-paper-2">
                  {groupRows.map((r) => {
                    const isMine = !!r.matter;
                    const body = (
                      <>
                        {isMine && <span aria-hidden="true" className="absolute left-0 top-0 h-full w-[2px] bg-ec-bronze" />}
                        <span
                          aria-label={r.item_no ? t("row.itemAria", { item: r.item_no }) : tc("states.notOnRecord")}
                          className="grid h-9 w-10 shrink-0 place-items-center rounded-ec-s bg-ec-paper-3 num text-[13px] text-ec-ink"
                        >
                          {r.item_no ? r.item_no : <EmptyCell label={tc("states.notOnRecord")} className="text-[8px] leading-tight" />}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-baseline gap-2">
                            <p className="font-display text-[14.5px] text-ec-ink">
                              {r.matter ? r.matter.title : (r.cnr ?? t("board.unknownCase"))}
                            </p>
                            {isMine && (
                              <span className="rounded-[3px] bg-ec-honey/25 px-1.5 py-0.5 num text-[9px] font-bold uppercase tracking-[0.18em] text-ec-on-honey">
                                {t("row.yours")}
                              </span>
                            )}
                          </div>
                          {r.cnr && <p className="mt-0.5 num text-[10.5px] text-ec-ink-3">{r.cnr}</p>}
                        </div>
                      </>
                    );
                    return (
                      <li key={r.id} className={`relative ${isMine ? "pl-[14px]" : ""}`}>
                        {r.matter ? (
                          <Link href={`/dashboard/cases/${r.matter.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-ec-paper-3/50">
                            {body}
                          </Link>
                        ) : (
                          <div className="flex items-center gap-3 px-4 py-3">{body}</div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        </>
      )}

      {/* ── Uploader: parse & match a new cause list (real product function) ── */}
      <section aria-labelledby="uploader-heading" className="print:hidden">
        <h2 id="uploader-heading" className="mb-3 text-sm font-semibold text-ec-ink">{t("uploader.heading")}</h2>
        <CauseListUploader />
      </section>

      <div className="print:hidden">
        <Disclaimer text={tc("disclaimer")} />
      </div>
    </div>
  );
}
