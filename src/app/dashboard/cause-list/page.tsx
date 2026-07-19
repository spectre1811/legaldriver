import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { Icon } from "@/components/icons";
import { EmptyCell, Disclaimer } from "@/components/court";
import { type ComboOption } from "@/components/combobox";
import { STATE_BAR_COUNCILS } from "@/lib/court/bar-councils.data";
import {
  getCourtDirectory,
  heldTiers,
  districtOptions,
  courtOptionsFor,
  findCourt,
  type Tier,
} from "@/lib/court/court-directory";
import { getCourtDataClient, isMockCourtProvider } from "@/lib/court/client";
import { hasOnDemandCauseList } from "@/lib/court/legaldriver";
import { initialBoardState } from "@/lib/court/causelist-state";
import { CauseListUploader } from "./uploader";
import { PrintButton } from "./print-button";
import { CauseListCascade } from "./cascade";
import { CauseListFetchLane } from "./fetch-lane";

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
// Whole-days-ago from an ISO board date (product voice — never the pipeline). Null on a bad date.
function freshnessDays(iso: string | null, today: string): number | null {
  if (!isValidIso(iso ?? undefined)) return null;
  const ms = Date.parse(`${today}T00:00:00Z`) - Date.parse(`${iso}T00:00:00Z`);
  return Math.max(0, Math.round(ms / 86_400_000));
}

type Entry = {
  id: string;
  item_no: string | null;
  court: string | null;
  list_date: string;
  cnr: string | null;
  matter: { id: string; title: string } | null;
};

// States we hold a court directory for = councils carrying an eCourts state_code (Gujarat today;
// grows as the platform verifies more). Labelled from the council registry.
const STATE_OPTIONS: ComboOption[] = STATE_BAR_COUNCILS.filter((c) => c.stateCode != null)
  .map((c) => ({ value: String(c.stateCode), label: c.label }))
  .sort((a, b) => a.label.localeCompare(b.label));
const HELD_STATE_CODES = new Set(STATE_OPTIONS.map((o) => o.value));

export default async function CauseListPage({
  searchParams,
}: {
  searchParams: { date?: string; state?: string; tier?: string; district?: string; court_id?: string };
}) {
  const t = await getTranslations("causeList");
  const tc = await getTranslations("common");
  const locale = await getLocale();

  const today = isoDate(new Date());
  const selected = isValidIso(searchParams.date) ? searchParams.date : today;
  const prev = addDays(selected, -1);
  const next = addDays(selected, 1);

  const supabase = createClient();

  // ── Default state scope = the union of the tenant's advocates' enrolled states (RLS-scoped). URL
  // state wins if held; else the tenant's first held state; else the first state we hold at all.
  const { data: advs } = await supabase.from("advocate").select("state_code");
  const tenantStates = [
    ...new Set((advs ?? []).map((a) => a.state_code).filter((s): s is string => HELD_STATE_CODES.has(s ?? ""))),
  ].sort();
  const urlState = searchParams.state && HELD_STATE_CODES.has(searchParams.state) ? searchParams.state : null;
  const stateCode = urlState ?? tenantStates[0] ?? STATE_OPTIONS[0]?.value ?? null;

  // ── Court directory for the selected state → the cascade options (only held-board courts). Skipped
  // on the mock provider (no live directory → we never fabricate a court list).
  const mock = isMockCourtProvider();
  const groups = (stateCode && !mock ? await getCourtDirectory(stateCode) : null) ?? [];
  const tiers = heldTiers(groups);

  // ── Tier: URL wins if held; else default to the advocate's likeliest tier (District — most work
  // happens there; also the only live-retrievable one). Falls to whatever tier the state holds.
  const urlTier = (searchParams.tier ?? "").toUpperCase();
  const tier: Tier | null =
    urlTier === "HIGH" || urlTier === "DISTRICT"
      ? (tiers.includes(urlTier as Tier) ? (urlTier as Tier) : null)
      : tiers.includes("DISTRICT")
        ? "DISTRICT"
        : (tiers[0] ?? null);

  // ── District (District tier only): URL value if it's a held district, else none (user picks).
  const districts = tier === "DISTRICT" ? districtOptions(groups) : [];
  const district =
    tier === "DISTRICT" && searchParams.district && districts.some((d) => d.value === searchParams.district)
      ? searchParams.district
      : null;

  // ── Court options within (tier, district). Court id honoured only if it's in the current options.
  const courtOptions = tier ? courtOptionsFor(groups, tier, district) : [];
  const courtId =
    searchParams.court_id && courtOptions.some((o) => o.value === searchParams.court_id)
      ? searchParams.court_id
      : null;
  const selectedCourt = courtId ? findCourt(groups, courtId) : null;

  // ── The state-scoped board: the selected court's cause list for the day (only when a court is
  // picked). Honest-empty on a miss; the on-demand island (below) drives the District live lane.
  const board = courtId
    ? await getCourtDataClient().getCauseList({ court: courtId, date: selected })
    : [];
  const boardFreshDays = freshnessDays(selectedCourt?.freshness ?? null, today);

  // ── Resolve the board's honest state (pure machine). onDemandLive gates the District fetch lane.
  const onDemandLive = !mock && hasOnDemandCauseList();
  const boardState = initialBoardState({
    courtId,
    tier: selectedCourt?.tier ?? tier,
    heldCount: board.length,
    onDemandLive,
  });

  // ── The tenant "Your matters" board (WO-201 W1) — your cases listed on the selected day.
  const { data } = await supabase
    .from("cause_list_entry")
    .select("id, item_no, court, list_date, cnr, matter:matter_id (id, title)")
    .eq("list_date", selected)
    .order("court", { ascending: true });

  const rows = ((data ?? []) as unknown as Entry[]).sort(
    (a, b) => (a.court ?? "").localeCompare(b.court ?? "") || itemNum(a.item_no) - itemNum(b.item_no),
  );
  const groupsByCourt = new Map<string, Entry[]>();
  for (const r of rows) {
    const key = r.court ?? "";
    (groupsByCourt.get(key) ?? groupsByCourt.set(key, []).get(key)!).push(r);
  }
  const mine = rows.filter((r) => r.matter);
  const mineCount = mine.length;
  const earliest = mine.reduce<string | null>((min, r) => {
    if (!r.item_no) return min;
    return min === null || itemNum(r.item_no) < itemNum(min) ? r.item_no : min;
  }, null);

  // Date-stepper links — preserve the whole scope so stepping keeps state/tier/district/court.
  const scopeParams = {
    ...(stateCode ? { state: stateCode } : {}),
    ...(tier ? { tier } : {}),
    ...(district ? { district } : {}),
    ...(courtId ? { court_id: courtId } : {}),
  };
  const stepHref = (date?: string) =>
    `/dashboard/cause-list?${new URLSearchParams({ ...scopeParams, ...(date ? { date } : {}) }).toString()}`;

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

      {/* ── Selector well: the picker cascade (state → tier → district → court) + date stepper + print. ── */}
      <div className="rounded-ec-s border border-ec-hair bg-ec-paper-3 p-4 print:hidden">
        <div className="flex flex-wrap items-end gap-x-5 gap-y-3">
          {!mock && (
            <CauseListCascade
              states={STATE_OPTIONS}
              tiers={tiers}
              districts={districts}
              courts={courtOptions}
              stateCode={stateCode}
              tier={tier}
              district={district}
              courtId={courtId}
            />
          )}

          <div className="flex flex-col gap-1.5">
            <span className="ec-label">{t("well.dateLabel")}</span>
            <div className="flex items-center gap-1 rounded-ec-s border border-ec-hair bg-ec-paper-2 px-1 py-0.5" role="group" aria-label={t("well.dateLabel")}>
              <Link href={stepHref(prev)} aria-label={t("well.prevDay")} className="grid h-7 w-7 place-items-center rounded-ec-s text-ec-ink-3 hover:bg-ec-paper-3 hover:text-ec-ink">
                <Icon name="back" className="h-3.5 w-3.5" />
              </Link>
              <Link href={stepHref()} aria-label={t("well.jumpToday")} className="num px-2 text-[11.5px] uppercase tracking-[0.08em] text-ec-ink">
                {selected === today ? `${t("well.today")} · ` : ""}
                {dateLabel}
              </Link>
              <Link href={stepHref(next)} aria-label={t("well.nextDay")} className="grid h-7 w-7 place-items-center rounded-ec-s text-ec-ink-3 hover:bg-ec-paper-3 hover:text-ec-ink">
                <Icon name="chevron" className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>

          <div className="ml-auto self-end">
            <PrintButton />
          </div>
        </div>
      </div>

      {/* ── State-scoped court board — the selected court's cause list for the day, with honest states. ── */}
      {!mock && (
        <section aria-label={t("courtBoard.heading")} className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-display text-[15px] text-ec-ink">
              {selectedCourt ? selectedCourt.label : t("courtBoard.heading")}
            </h2>
            {boardState === "held" && boardFreshDays !== null && (
              <span className="num text-[11px] text-ec-ink-2" aria-live="polite">
                {boardFreshDays === 0 ? t("courtBoard.freshToday") : t("courtBoard.freshDays", { days: boardFreshDays })}
              </span>
            )}
          </div>

          {boardState === "pick" ? (
            <EmptyPanel
              title={t("courtBoard.pick.title")}
              body={courtOptions.length || tiers.length ? t("courtBoard.pick.body") : t("courtBoard.noCourts")}
            />
          ) : boardState === "hcUnheld" ? (
            // High Court lists are PDF-only and not yet retrievable live (WO-150) — an HONEST state,
            // never a fake queue or a spinner. No on-demand call is made for HC.
            <EmptyPanel title={t("courtBoard.hcUnheld.title")} body={t("courtBoard.hcUnheld.body")} />
          ) : boardState === "held" ? (
            <ul className="divide-y divide-ec-hair overflow-hidden rounded-ec-s border border-ec-hair bg-ec-paper-2">
              {board.map((it, i) => (
                <li key={`${it.cnr ?? "row"}-${i}`} className="flex items-center gap-3 px-4 py-3">
                  <span
                    aria-label={it.itemNo ? t("row.itemAria", { item: it.itemNo }) : tc("states.notOnRecord")}
                    className="grid h-9 w-10 shrink-0 place-items-center rounded-ec-s bg-ec-paper-3 num text-[13px] text-ec-ink"
                  >
                    {it.itemNo ? it.itemNo : <EmptyCell label={tc("states.notOnRecord")} className="text-[8px] leading-tight" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-display text-[14.5px] text-ec-ink">{it.title ?? it.cnr ?? t("board.unknownCase")}</p>
                    {it.cnr && <p className="mt-0.5 num text-[10.5px] text-ec-ink-3">{it.cnr}</p>}
                  </div>
                </li>
              ))}
            </ul>
          ) : boardState === "fetching" && courtId ? (
            // District held-miss + live lane on → the non-blocking on-demand island retrieves + polls.
            <CauseListFetchLane courtId={courtId} date={selected} />
          ) : (
            // empty — held-miss with no live lane (mock / flag off) or a lane-confirmed no-board.
            <EmptyPanel title={t("courtBoard.empty.title")} body={t("courtBoard.empty.body")} />
          )}
        </section>
      )}

      {/* ── Your matters rail: your cases listed on the selected day (WO-201 W1). ── */}
      <section aria-labelledby="yours-heading" className="space-y-3">
        <h2 id="yours-heading" className="font-display text-[15px] text-ec-ink">{t("summary.yours")}</h2>
        {rows.length === 0 ? (
          <EmptyPanel title={t("boardEmpty.title")} body={t("boardEmpty.body")} />
        ) : (
          <>
            <div role="status" aria-live="polite" className="sticky top-0 z-10 rounded-ec-s border border-ec-hair bg-ec-paper-2/85 px-3 py-2 text-[12px] text-ec-ink-2 backdrop-blur">
              {t("summary.yours")}: <span className="num text-ec-ink">{mineCount}</span>
              {earliest && (
                <>
                  {" · "}
                  {t("summary.earliest", { item: earliest })}
                </>
              )}
            </div>

            <div className="space-y-5">
              {[...groupsByCourt.entries()].map(([court, groupRows]) => (
                <section key={court || "unassigned"} aria-label={court || t("group.unassigned")}>
                  <div className="flex items-baseline justify-between rounded-t-ec-s border border-ec-hair bg-ec-paper-3 px-4 py-2.5">
                    <h3 className="min-w-0 truncate font-display text-[15px] text-ec-ink">{court || t("group.unassigned")}</h3>
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
      </section>

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

// The board's honest empty/pick/HC-unheld panel — one dashed card, one voice.
function EmptyPanel({ title, body }: { title: string; body: string }) {
  return (
    <div className="grid min-h-[160px] place-items-center rounded-ec-s border border-dashed border-ec-hair bg-ec-paper-2/50 text-center">
      <div className="max-w-sm px-4">
        <p className="font-display text-lg text-ec-ink">{title}</p>
        <p className="mt-1 text-sm text-ec-ink-3">{body}</p>
      </div>
    </div>
  );
}
