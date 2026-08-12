import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { brand } from "@/lib/brand";
import { BrandMark } from "@/components/brand-mark";
import { Icon } from "@/components/icons";
import { LanguageSwitcher } from "@/components/language-switcher";
import { HeroSearch } from "@/components/landing/hero-search";
import { CountUp, ScrollReveals } from "@/components/landing/motion";
import { RequestAccessNavCta } from "@/components/landing/request-access-nav-cta";
import { links, pricing, grievanceOfficer, hasGrievanceOfficer } from "@/lib/site-config";

// Public marketing landing — WO-324 "Daybreak" reskin, rebuilt section-for-section
// against the founder-approved reference design-mockups/iteration3/landing-v6-daybreak.html
// (supersedes the WO-03/WO-53 first pass). All numbers + legally-sensitive facts still
// come from src/lib/site-config.ts — pricing gated behind `pricing.public`
// (FOUNDER-ACTIONS #11); the footer's legal-links + grievance-officer keys are the
// same cross-page ones src/components/marketing-shell.tsx reads — do not rename them.
//
// WO-326 (search proxy) / WO-327 (host routing) are separate agents' surfaces and land
// later: the universal search hands off to search.mukadma.in (src/components/landing/
// hero-search.tsx) and the "Today's matters" card + the coverage stat below render the
// static/illustrative shape the reference specifies, not a live API read.

// Sample case data for the "Today's matters" card — like the shipped page's prior MINI
// array, this is illustrative product-shape data (case captions are always Latin-script
// even in a Hindi UI, matching real Indian court records), not a live/localized read.
const LIVE_ROWS = [
  { time: "10:30", title: "Sharma v. State of Gujarat", meta: "Court 7 · item 14 · final hearing", chip: "review" },
  { time: "12:15", title: "Mehta v. GSRTC", meta: "Court 2 · item 03 · arguments", chip: "listed" },
  { time: "15:00", title: "Desai v. Desai", meta: "Court 11 · item 41 · notice", chip: "next" },
] as const;

const CHIP_CLASS: Record<(typeof LIVE_ROWS)[number]["chip"], string> = {
  review: "ec-chip-hot",
  listed: "bg-ec-paper-3 border-transparent",
  next: "",
};

const BRINGS_TILES = [
  { key: "day", icon: "sunrise" },
  { key: "folder", icon: "documents" },
  { key: "inbox", icon: "inbox" },
  { key: "search", icon: "search", href: links.publicSearch },
] as const;

const MOMENTS = ["m1", "m2", "m3", "m4"] as const;

const RECORD_CARDS = [
  { key: "cases", icon: "search", href: links.publicSearch },
  { key: "judges", icon: "judge", href: `${links.publicSearch}/people` },
  { key: "advocates", icon: "clients", href: `${links.publicSearch}/people` },
  { key: "orders", icon: "documents", href: links.publicSearch },
  { key: "judgments", icon: "scroll", href: links.publicSearch },
] as const;

// Footer column → route map (product/company/legal key NAMES are load-bearing:
// marketing-shell.tsx reads landing.footer.col.{product,company,legal}.* on every
// legal/company secondary page, so the taxonomy stays even though the header
// copy + visual treatment below now match the Daybreak dark footer).
const FOOTER_LINKS = {
  product: { a: "/#brings", b: "/#pricing", c: "/for-clients" },
  company: { a: "/about", b: "/why-us", c: "/contact" },
  legal: { a: "/privacy", b: "/terms", c: "/data-corrections", d: "/refund", e: "/cancellation" },
} as const;

export async function Landing() {
  const t = await getTranslations("landing");

  return (
    <div className="mk-hero-wash min-h-screen bg-ec-paper text-ec-ink">
      <ScrollReveals />
      {/* nav */}
      <header className="sticky top-0 z-50 border-b border-ec-hair bg-ec-paper/85 backdrop-blur">
        <nav className="mx-auto flex max-w-6xl items-center gap-6 px-6 py-3.5">
          <Link href="/" className="flex items-center gap-2.5">
            <BrandMark size={32} tone="dark" />
            <span className="leading-tight">
              <b className="ec-underline block font-display text-xl font-medium lowercase tracking-tight">{brand.name}</b>
              {/* WO-410 F4: mt-1.5 clears the honey underline (globals.css .ec-underline::after,
                  4px below the wordmark's own line box) before मुक़दमा's shirorekha/nukta — same
                  gap nav.tsx's sidebar lockup already uses; landing was missing it and the bar cut
                  straight through the Devanagari. */}
              <span className="mt-1.5 block text-[11px] text-ec-ink-3" lang="hi">{brand.nameDevanagari}</span>
            </span>
          </Link>
          <div className="ml-6 hidden items-center gap-1 sm:flex">
            <a href="#brings" className="rounded-ec-s px-3 py-1.5 text-sm font-medium text-ec-ink-2 hover:bg-ec-paper-3 hover:text-ec-ink">{t("nav.products")}</a>
            <a href="#records" className="rounded-ec-s px-3 py-1.5 text-sm font-medium text-ec-ink-2 hover:bg-ec-paper-3 hover:text-ec-ink">{t("nav.records")}</a>
            <a href="#pricing" className="rounded-ec-s px-3 py-1.5 text-sm font-medium text-ec-ink-2 hover:bg-ec-paper-3 hover:text-ec-ink">{t("nav.pricing")}</a>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <LanguageSwitcher className="hidden sm:inline-flex" />
            <Link href="/login" className="rounded-ec-s px-3 py-1.5 text-sm font-medium text-ec-ink-2 hover:bg-ec-paper-3">{t("nav.login")}</Link>
            <RequestAccessNavCta />
          </div>
        </nav>
      </header>

      {/* hero */}
      <section className="mx-auto grid max-w-6xl items-center gap-12 px-6 py-12 lg:grid-cols-[1.02fr_.98fr] lg:py-16">
        <div>
          <p className="mk-eyebrow mb-5 mk-anim-eyebrow">{t("hero.eyebrow")}</p>
          <h1 className="font-display text-[clamp(2.5rem,5.4vw,4.25rem)] font-normal leading-[1.02] tracking-tight">
            <span className="mk-word">{t("hero.title1")}</span>
            <span className="mk-word">{t("hero.title2")}</span>
            <span className="mk-word"><em className="italic text-ec-bronze-deep">{t("hero.title3")}</em></span>
          </h1>
          <p className="mt-5 max-w-md text-[16.5px] leading-relaxed text-ec-ink-2 mk-anim-sub">{t("hero.sub")}</p>
          <HeroSearch
            searchHost={links.publicSearch}
            tabs={{ cases: t("search.tabCases"), people: t("search.tabPeople"), judgments: t("search.tabJudgments") }}
            placeholder={t("search.placeholder")}
            ariaLabel={t("search.ariaLabel")}
            button={t("search.button")}
          />
        </div>

        {/* live "Today's matters" card — static shape; WO-326 wires the real read */}
        <div className="mk-anim-card overflow-hidden rounded-2xl border border-ec-hair bg-ec-paper-2 shadow-ec-2">
          <div className="flex items-center justify-between border-b border-ec-hair px-5 py-4">
            <h3 className="font-display text-lg font-medium">{t("live.title")}</h3>
            <span className="inline-flex items-center gap-1.5 font-mono text-[11px] font-medium text-ec-success">
              <span className="h-1.5 w-1.5 rounded-full bg-ec-success" /> {t("live.status")}
            </span>
          </div>
          {LIVE_ROWS.map((row, i) => (
            <div key={row.title} style={{ animationDelay: `${0.55 + i * 0.15}s` }} className="mk-anim-row flex items-center gap-3.5 border-b border-ec-hair px-5 py-3.5 last:border-0">
              <span className="num w-11 flex-none text-[12.5px] font-medium text-ec-bronze-deep">{row.time}</span>
              <div className="min-w-0 flex-1">
                <b className="block truncate text-sm font-semibold">{row.title}</b>
                <span className="block truncate font-mono text-[11px] text-ec-ink-3">{row.meta}</span>
              </div>
              <span className={`ec-chip flex-none ${CHIP_CLASS[row.chip]}`}>{t(`live.chip.${row.chip}`)}</span>
            </div>
          ))}
          <div className="flex items-center justify-between bg-ec-paper-3 px-5 py-3">
            <span className="font-mono text-[11px] text-ec-ink-3">{t("live.source")}</span>
            <Link href="/request-access" className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-ec-bronze-deep hover:underline">
              {t("live.openOverview")} <Icon name="chevron" className="h-3 w-3" />
            </Link>
          </div>
        </div>
      </section>

      {/* what mukadma brings together — editorial capability tiles (no console mocks) */}
      <section id="brings" className="mx-auto max-w-6xl px-6 py-16 sm:py-20">
        <div className="mk-reveal max-w-xl">
          <p className="mk-eyebrow">{t("brings.eyebrow")}</p>
          <h2 className="mt-3 font-display text-[clamp(1.75rem,4vw,2.75rem)] font-normal leading-tight tracking-tight">
            {t("brings.title1")} <em className="italic text-ec-bronze-deep">{t("brings.titleEm")}</em>
          </h2>
          <p className="mt-3 text-[15.5px] leading-relaxed text-ec-ink-2">{t("brings.sub")}</p>
        </div>
        <div className="mt-10 grid gap-3.5 sm:grid-cols-2">
          {BRINGS_TILES.map((tile, i) => {
            const isLink = "href" in tile;
            const inner = (
              <>
                <span className="absolute right-6 top-6 font-display text-xl italic text-ec-hair-strong">{`0${i + 1}`}</span>
                <Icon name={tile.icon} className="mk-icon mb-4 h-9 w-9 text-ec-ink" />
                <h3 className="mb-2 max-w-[20ch] font-display text-xl font-medium leading-snug">{t(`brings.tiles.${tile.key}.title`)}</h3>
                <p className="max-w-[46ch] text-sm leading-relaxed text-ec-ink-2">{t(`brings.tiles.${tile.key}.body`)}</p>
                <div className={`mt-5 border-t border-ec-hair pt-4 font-mono text-[11.5px] tracking-[0.04em] text-ec-ink-3 ${isLink ? "inline-flex items-center gap-2 text-ec-bronze-deep" : ""}`}>
                  {t(`brings.tiles.${tile.key}.tag`)}
                  {isLink && <Icon name="external" className="h-3 w-3" />}
                </div>
              </>
            );
            const style = { transitionDelay: `${(i % 4) * 70}ms` };
            return isLink ? (
              <a key={tile.key} href={tile.href} style={style} className="group mk-reveal relative block rounded-2xl border border-ec-hair bg-ec-paper-2 p-7 transition hover:border-ec-hair-strong hover:shadow-ec-2">{inner}</a>
            ) : (
              <div key={tile.key} style={style} className="group mk-reveal relative rounded-2xl border border-ec-hair bg-ec-paper-2 p-7 transition hover:border-ec-hair-strong hover:shadow-ec-2">{inner}</div>
            );
          })}
        </div>
      </section>

      {/* a better way to start — day timeline + pull-quote */}
      <section className="mx-auto max-w-6xl px-6 py-16 sm:py-20">
        <div className="grid gap-10 lg:grid-cols-[.9fr_1.1fr] lg:gap-14">
          <div className="mk-reveal lg:sticky lg:top-24 lg:self-start">
            <p className="mk-eyebrow">{t("day.eyebrow")}</p>
            <h2 className="mt-3 max-w-sm font-display text-[clamp(1.75rem,4vw,2.5rem)] font-normal leading-tight tracking-tight">
              {t("day.title1")} <em className="italic text-ec-bronze-deep">{t("day.titleEm")}</em>
            </h2>
            <p className="mt-3.5 max-w-[36ch] text-[15px] leading-relaxed text-ec-ink-2">{t("day.sub")}</p>
            <blockquote className="mk-quote-wash mt-6 rounded-r-xl border-l-[3px] border-ec-honey py-5 pl-6 pr-5">
              <p className="font-display text-lg italic leading-snug">{t("day.quote")}</p>
              <cite className="mt-3 block font-mono text-[10.5px] font-medium not-italic uppercase tracking-[0.16em] text-ec-bronze-deep">{t("day.quoteBy")}</cite>
            </blockquote>
          </div>
          <div>
            {MOMENTS.map((m, i) => (
              <div key={m} style={{ transitionDelay: `${(i % 4) * 70}ms` }} className="mk-reveal grid grid-cols-[80px_1fr] gap-4 border-t border-ec-hair py-6 first:border-t-0">
                <span className="num pt-0.5 text-[12.5px] font-medium text-ec-bronze-deep">{t(`day.moments.${m}.time`)}</span>
                <div>
                  <h3 className="mb-1 font-display text-[19px] font-medium">{t(`day.moments.${m}.title`)}</h3>
                  <p className="max-w-[46ch] text-sm leading-relaxed text-ec-ink-2">{t(`day.moments.${m}.body`)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* coverage — living stats. The count is a static placeholder shape until WO-326
          binds it to /api/public/stats; the cadence cells are always true, no frozen date. */}
      <section className="mx-auto max-w-6xl px-6 pb-16 sm:pb-20">
        <p className="mk-eyebrow mb-9 mk-reveal">{t("stats.eyebrow")}</p>
        <div className="grid gap-3.5 sm:grid-cols-3">
          <div className="mk-reveal rounded-2xl border border-ec-hair bg-ec-paper-2 p-6">
            <b className="num block text-[clamp(1.75rem,3vw,2.25rem)] font-medium tracking-tight">
              <CountUp value={55} /> <em className="not-italic text-ec-bronze-deep">{t("stats.unit")}</em>
            </b>
            <span className="mt-2 block font-mono text-[10.5px] uppercase tracking-[0.14em] text-ec-ink-2">{t("stats.cases")}</span>
          </div>
          <div style={{ transitionDelay: "70ms" }} className="mk-reveal rounded-2xl border border-ec-hair bg-ec-paper-2 p-6">
            <b className="num block text-[clamp(1.75rem,3vw,2.25rem)] font-medium tracking-tight">{t("stats.morning")}</b>
            <span className="mt-2 block font-mono text-[10.5px] uppercase tracking-[0.14em] text-ec-ink-2">{t("stats.morningCaption")}</span>
          </div>
          <div style={{ transitionDelay: "140ms" }} className="mk-reveal rounded-2xl border border-ec-hair bg-ec-paper-2 p-6">
            <b className="num block text-[clamp(1.75rem,3vw,2.25rem)] font-medium tracking-tight">{t("stats.night")}</b>
            <span className="mt-2 block font-mono text-[10.5px] uppercase tracking-[0.14em] text-ec-ink-2">{t("stats.nightCaption")}</span>
          </div>
        </div>
      </section>

      {/* public records — dark section, every card routes to search.mukadma.in */}
      <section id="records" className="mk-records-wash relative overflow-hidden bg-ec-ink py-16 text-ec-paper sm:py-20">
        <div className="relative z-[1] mx-auto max-w-6xl px-6">
          <div className="mk-reveal max-w-xl">
            <p className="mk-eyebrow !text-ec-honey">{t("records.eyebrow")}</p>
            <h2 className="mt-3 font-display text-[clamp(1.75rem,4vw,2.75rem)] font-normal leading-tight tracking-tight text-ec-paper">
              {t("records.title1")} <em className="italic text-ec-honey">{t("records.titleEm")}</em>
            </h2>
            <p className="mt-3 text-[15.5px] leading-relaxed text-white/60">{t("records.sub")}</p>
          </div>
          <div className="mt-10 grid gap-px overflow-hidden rounded-2xl border border-white/10 sm:grid-cols-3 lg:grid-cols-5">
            {RECORD_CARDS.map((card, i) => (
              <a key={card.key} href={card.href} style={{ transitionDelay: `${(i % 4) * 70}ms` }} className="group mk-reveal bg-ec-ink p-6 transition hover:bg-white/[0.04]">
                <Icon name={card.icon} className="mk-icon mb-4 h-7 w-7 text-ec-honey" />
                <h3 className="mb-1.5 font-display text-lg font-medium">{t(`records.cards.${card.key}.title`)}</h3>
                <p className="min-h-[3.2em] text-[12.5px] leading-relaxed text-white/50">{t(`records.cards.${card.key}.body`)}</p>
                <span className="inline-flex items-center gap-1.5 font-mono text-[11px] font-medium text-ec-honey">{t("records.go")} <Icon name="chevron" className="h-3 w-3" /></span>
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* pricing — Free + Pro, monthly|yearly toggle (native radios + CSS :has(), no JS).
          STRUCTURE always ships; NUMBERS gate behind pricing.public (FOUNDER-ACTIONS #11).
          Every CTA lands on /request-access — no checkout this WO. */}
      <section id="pricing" className="mk-cycle mx-auto max-w-6xl px-6 py-16 sm:py-20">
        <div className="mk-reveal mx-auto max-w-2xl text-center">
          <p className="mk-eyebrow justify-center">{t("pricing.eyebrow")}</p>
          <h2 className="mt-3 font-display text-[clamp(1.75rem,4vw,2.75rem)] font-normal leading-tight tracking-tight">
            {t("pricing.title1")} <em className="italic text-ec-bronze-deep">{t("pricing.titleEm")}</em>
          </h2>
          <p className="mt-3 text-[15.5px] leading-relaxed text-ec-ink-2">{t("pricing.sub")}</p>
        </div>

        {pricing.public && (
          <div className="mk-reveal mb-8 mt-7 flex justify-center">
            <div className="inline-flex gap-0.5 rounded-full border border-ec-hair bg-ec-paper-3 p-1">
              <input type="radio" id="mk-cyc-m" name="mk-cyc" defaultChecked className="sr-only" />
              <label htmlFor="mk-cyc-m" className="mk-cyc-label cursor-pointer rounded-full px-4 py-2 text-[13px] font-medium text-ec-ink-3 transition">{t("pricing.billing.monthly")}</label>
              <input type="radio" id="mk-cyc-y" name="mk-cyc" className="sr-only" />
              <label htmlFor="mk-cyc-y" className="mk-cyc-label inline-flex cursor-pointer items-center gap-2 rounded-full px-4 py-2 text-[13px] font-medium text-ec-ink-3 transition">
                {t("pricing.billing.yearly")} <span className="rounded-full bg-ec-honey px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ec-on-honey">{t("pricing.billing.save")}</span>
              </label>
            </div>
          </div>
        )}

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {/* Free */}
          <div className="mk-reveal flex flex-col rounded-2xl border border-ec-hair bg-ec-paper-2 p-7">
            <p className="ec-label">{t("pricing.tier.free.name")}</p>
            <p className="mt-1 text-[13px] text-ec-ink-3">{t("pricing.tier.free.desc")}</p>
            {pricing.public ? (
              <>
                <p className="mt-5 font-display text-4xl font-medium"><span className="num">{pricing.tiers[0].monthlyPrice}</span></p>
                <p className="mt-0.5 font-mono text-xs text-ec-ink-3">{t("pricing.tier.free.billNote")}</p>
                <ul className="my-5 flex-1 space-y-3 border-t border-ec-hair pt-5">
                  {pricing.tiers[0].features.map((f) => (
                    <li key={f} className="flex items-start gap-2.5 text-[13.5px] leading-snug text-ec-ink-2">
                      <Icon name="check" className="mt-0.5 h-3.5 w-3.5 flex-none text-ec-success" />
                      {t(`pricing.tier.free.f.${f}`)}
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <>
                <p className="mt-5 font-display text-lg font-medium text-ec-ink-3">{t("pricing.tbd")}</p>
                <p className="my-5 flex-1 text-[13px] leading-relaxed text-ec-ink-2">{t("pricing.tier.free.summary")}</p>
              </>
            )}
            <Link href="/request-access" className="ec-btn ec-btn-ghost mt-auto justify-center">{t("pricing.cta.start")}</Link>
          </div>

          {/* Pro */}
          <div style={{ transitionDelay: "70ms" }} className="mk-reveal relative flex flex-col rounded-2xl border border-ec-honey bg-ec-paper-2 p-7 shadow-ec-2">
            <span className="absolute -top-3 left-7 rounded-full bg-ec-honey px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-ec-on-honey">{t("pricing.tier.pro.ribbon")}</span>
            <p className="ec-label mt-1">{t("pricing.tier.pro.name")}</p>
            <p className="mt-1 text-[13px] text-ec-ink-3">{t("pricing.tier.pro.desc")}</p>
            {pricing.public ? (
              <>
                <p className="mk-amt-m mt-5 font-display text-4xl font-medium">
                  <span className="num">{pricing.tiers[1].monthlyPrice}</span> <span className="text-sm font-normal text-ec-ink-3">{t("pricing.tier.pro.monthlyUnit")}</span>
                </p>
                <p className="mk-amt-y mt-5 font-display text-4xl font-medium">
                  <span className="num">{pricing.tiers[1].yearlyPrice}</span> <span className="text-sm font-normal text-ec-ink-3">{t("pricing.tier.pro.yearlyUnit")}</span>{" "}
                  <span className="ml-1 rounded-full bg-ec-honey px-2 py-0.5 text-[11px] font-semibold text-ec-on-honey">{t("pricing.tier.pro.save")}</span>
                </p>
                <p className="mk-bill-m font-mono text-xs text-ec-ink-3">{t("pricing.tier.pro.billMonthly")}</p>
                <p className="mk-bill-y font-mono text-xs text-ec-ink-3">{t("pricing.tier.pro.billYearly")}</p>
                <ul className="my-5 flex-1 space-y-3 border-t border-ec-hair pt-5">
                  <li className="text-[13px] font-semibold text-ec-ink">{t("pricing.tier.pro.featHead")}</li>
                  {pricing.tiers[1].features.map((f) => (
                    <li key={f} className="flex items-start gap-2.5 text-[13.5px] leading-snug text-ec-ink-2">
                      <Icon name="check" className="mt-0.5 h-3.5 w-3.5 flex-none text-ec-success" />
                      {t(`pricing.tier.pro.f.${f}`)}
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <>
                <p className="mt-5 font-display text-lg font-medium text-ec-ink-3">{t("pricing.tbd")}</p>
                <p className="my-5 flex-1 text-[13px] leading-relaxed text-ec-ink-2">{t("pricing.tier.pro.summary")}</p>
              </>
            )}
            <Link href="/request-access" className="ec-btn ec-btn-brass mt-auto justify-center">{t("pricing.cta.choose")}</Link>
          </div>
        </div>
        {!pricing.public && <p className="mx-auto mt-8 max-w-md text-center text-sm text-ec-ink-3">{t("pricing.soon")}</p>}
      </section>

      {/* closing band */}
      <section className="bg-ec-paper-3">
        <div className="mk-reveal mx-auto grid max-w-6xl items-center gap-6 px-6 py-14 sm:grid-cols-[1fr_auto] sm:py-20">
          <div>
            <p className="mk-eyebrow mb-3.5">{t("band.eyebrow")}</p>
            <h2 className="font-display text-[clamp(1.75rem,3.8vw,2.75rem)] font-normal leading-tight tracking-tight">{t("band.title")}</h2>
            <p className="mt-3 max-w-md text-[15px] leading-relaxed text-ec-ink-2">{t("band.sub")}</p>
          </div>
          <Link href="/request-access" className="ec-btn ec-btn-ink">{t("nav.requestAccess")} <Icon name="chevron" className="h-3.5 w-3.5" /></Link>
        </div>
      </section>

      {/* footer */}
      <footer className="bg-ec-ink text-white/60">
        <div className="mx-auto grid max-w-6xl gap-8 px-6 py-12 sm:grid-cols-[1.5fr_1fr_1fr_1fr]">
          <div className="max-w-xs">
            <Link href="/" className="flex items-center gap-2.5">
              <BrandMark size={30} tone="light" />
              <span className="font-display text-xl font-medium lowercase tracking-tight text-ec-paper">{brand.name}</span>
            </Link>
            <p className="mt-4 max-w-[22ch] font-display text-[14.5px] italic leading-snug text-white/50">{t("footer.tagline")}</p>
            <a href={links.publicSearch} className="mt-4 inline-block text-[13px] font-semibold text-ec-honey hover:underline">{t("footer.publicSearch")} →</a>
          </div>
          {(["product", "company", "legal"] as const).map((col) => (
            <div key={col}>
              <p className="mb-3.5 font-mono text-[10.5px] uppercase tracking-[0.2em] text-white/35">{t(`footer.col.${col}.h`)}</p>
              {Object.keys(FOOTER_LINKS[col]).map((it) => (
                <Link key={it} href={(FOOTER_LINKS[col] as Record<string, string>)[it]} className="block py-1 text-[13.5px] text-white/65 hover:text-ec-paper">{t(`footer.col.${col}.${it}`)}</Link>
              ))}
            </div>
          ))}
        </div>
        <div className="border-t border-white/10">
          <div className="mx-auto max-w-6xl px-6 py-5">
            <p className="text-[11.5px] leading-relaxed text-white/40">
              {hasGrievanceOfficer() ? (
                <span>{t("footer.grievance.label")}: {grievanceOfficer.name} · <a href={`mailto:${grievanceOfficer.email}`} className="hover:text-ec-honey">{grievanceOfficer.email}</a>. </span>
              ) : (
                <span>{t("footer.grievance.label")}: {t("footer.grievance.pending")}. </span>
              )}
              {t("footer.compliance")}
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
