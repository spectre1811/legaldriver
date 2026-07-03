import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { brand } from "@/lib/brand";
import { Icon } from "@/components/icons";
import { BrandMark } from "@/components/brand-mark";
import { LanguageSwitcher } from "@/components/language-switcher";

// Public marketing landing (WO-03 Wave 4), from design/ui-concept.html Mockup A.
// NOTE: pricing figures + tier limits below mirror the design concept and must be
// FOUNDER-CONFIRMED against INPUTS §C.7 before this page is made public. Kept in
// one config so they're easy to verify/change.
const TIERS = [
  { id: "free", price: "₹0", per: false, features: ["cases", "digest", "clients", "search"], cta: "start", hot: false },
  { id: "basic", price: "₹399", per: true, features: ["cases", "alerts", "invoicing", "credits"], cta: "choose", hot: false },
  { id: "pro", price: "₹999", per: true, features: ["cases", "credits", "portal", "marketplace"], cta: "choose", hot: true },
  { id: "enterprise", price: "Custom", per: false, features: ["tenants", "audit", "pooled", "support"], cta: "talk", hot: false },
] as const;

const FOOTER_LINKS = {
  product: { a: "/#features", b: "/#pricing", c: "/for-clients" },
  company: { a: "/about", b: "/why-us", c: "/contact" },
  legal: { a: "/privacy", b: "/terms", c: "/data-corrections" },
} as const;

const MINI = [
  { item: "14", title: "Patel v. State of Gujarat", court: "Gujarat HC · Court 7", stage: "Final hearing" },
  { item: "42", title: "Shah Traders v. Mehta Buildcon", court: "City Civil, Ahmedabad · Court 3", stage: "Evidence" },
  { item: "07", title: "Bhavna Textiles v. Parmar", court: "Ahmedabad Rural · Court 11", stage: "Arguments" },
];

export async function Landing() {
  const t = await getTranslations("landing");
  return (
    <div className="min-h-screen bg-ec-paper text-ec-ink">
      {/* nav */}
      <nav className="mx-auto flex max-w-6xl items-center gap-6 px-6 py-4">
        <span className="flex items-center gap-2.5">
          <BrandMark size={30} tone="dark" />
          <span className="ec-underline font-display text-2xl font-semibold lowercase tracking-tight">{brand.name}</span>
        </span>
        <div className="ml-6 hidden gap-1 sm:flex">
          <a href="#features" className="rounded-ec-s px-3 py-1.5 text-sm font-medium text-ec-ink-2 hover:bg-ec-paper-3 hover:text-ec-ink">{t("nav.features")}</a>
          <a href="#pricing" className="rounded-ec-s px-3 py-1.5 text-sm font-medium text-ec-ink-2 hover:bg-ec-paper-3 hover:text-ec-ink">{t("nav.pricing")}</a>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <LanguageSwitcher className="hidden sm:inline-flex" />
          <Link href="/login" className="rounded-ec-s px-3 py-1.5 text-sm font-medium text-ec-ink-2 hover:bg-ec-paper-3">{t("nav.login")}</Link>
          <Link href="/login" className="ec-btn ec-btn-ink">{t("nav.startFree")}</Link>
        </div>
      </nav>

      {/* hero */}
      <header className="mx-auto grid max-w-6xl items-center gap-12 px-6 py-12 lg:grid-cols-[1.05fr_.95fr] lg:py-16">
        <div>
          <p className="mb-3 font-display text-[15px] font-medium italic text-ec-brass-deep">{t("hero.overline")}</p>
          <h1 className="font-display text-[clamp(2.5rem,5vw,3.25rem)] font-medium leading-[1.08] tracking-tight">
            {t("hero.title1")}<br /><span className="italic text-ec-brass-deep">{t("hero.title2")}</span>
          </h1>
          <p className="mt-4 max-w-md text-[17px] leading-relaxed text-ec-ink-2">{t("hero.sub")}</p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Link href="/login" className="ec-btn ec-btn-ink">{t("hero.ctaStart")}</Link>
            <a href="#pricing" className="ec-btn ec-btn-ghost">{t("hero.ctaPricing")}</a>
            <span className="text-xs text-ec-ink-3">{t("hero.note")}</span>
          </div>
        </div>

        {/* mini product card */}
        <div className="ec-card overflow-hidden shadow-ec-2" style={{ transform: "rotate(.4deg)" }}>
          <div className="flex items-center justify-between border-b border-ec-hair px-4 py-2.5">
            <b className="num text-[13px] font-semibold">{t("hero.overline2")} <span className="font-medium text-ec-ink-3">· Thu 2 Jul</span></b>
            <div className="num flex gap-1 text-[10px] font-semibold text-ec-ink-3">
              {["29", "30", "1", "2", "3", "4"].map((d) => (
                <span key={d} className={d === "2" ? "rounded-full bg-ec-brass px-1.5 text-white" : "px-1"}>{d}</span>
              ))}
            </div>
          </div>
          {MINI.map((m) => (
            <div key={m.item} className="grid grid-cols-[28px_1fr_auto] items-center gap-3 border-b border-ec-hair px-4 py-2.5 last:border-0">
              <span className="num text-[13px] font-semibold text-ec-brass-deep">{m.item}</span>
              <div className="min-w-0">
                <b className="block truncate font-display text-[12.5px] font-medium">{m.title}</b>
                <span className="block truncate text-[11px] text-ec-ink-3">{m.court}</span>
              </div>
              <span className="ec-chip text-[9.5px]">{m.stage}</span>
            </div>
          ))}
          <div className="flex items-center gap-1.5 bg-ec-paper-3 px-4 py-2 text-[11px] text-ec-ink-3">
            <span className="h-2 w-2 rounded-full bg-ec-success" /> {t("hero.miniFoot")}
          </div>
        </div>
      </header>

      {/* proof strip */}
      <div className="border-y border-ec-hair bg-ec-paper">
        <div className="mx-auto flex max-w-6xl flex-wrap justify-center gap-x-8 gap-y-2 px-6 py-4">
          {["hc", "district", "judgments", "cnr"].map((k) => (
            <span key={k} className="text-xs font-semibold uppercase tracking-widest text-ec-ink-3">{t(`proof.${k}`)}</span>
          ))}
        </div>
      </div>

      {/* features */}
      <section id="features" className="mx-auto grid max-w-6xl gap-6 px-6 py-16 md:grid-cols-3">
        {["evening", "running", "fee"].map((f) => (
          <div key={f} className="rounded-ec-m border border-ec-hair bg-ec-paper p-6 transition hover:shadow-ec-1">
            <p className="mb-4 font-display text-[15px] italic text-ec-brass-deep">{t(`features.${f}.eyebrow`)}</p>
            <h3 className="mb-2 font-display text-[21px] font-medium leading-snug">{t(`features.${f}.title`)}</h3>
            <p className="text-sm leading-relaxed text-ec-ink-2">{t(`features.${f}.body`)}</p>
          </div>
        ))}
      </section>

      {/* pricing */}
      <section id="pricing" className="mx-auto max-w-6xl px-6 pb-20">
        <h2 className="text-center font-display text-3xl font-medium">{t("pricing.title")}</h2>
        <p className="mt-2 text-center text-sm text-ec-ink-3">{t("pricing.note")}</p>
        <p className="mb-8 mt-1 text-center text-[13px] font-medium text-ec-brass-deep">{t("pricing.founding")}</p>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {TIERS.map((tier) => (
            <div key={tier.id} className={`relative flex flex-col rounded-ec-m border bg-ec-paper p-6 ${tier.hot ? "border-ec-brass shadow-ec-2" : "border-ec-hair"}`}>
              {tier.hot && <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full bg-ec-brass px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white">{t("pricing.mostChosen")}</span>}
              <p className="ec-label">{t(`pricing.tier.${tier.id}.name`)}</p>
              <p className="mt-2 font-display text-3xl font-medium">
                <span className="num">{tier.price}</span>
                {tier.per && <span className="text-xs font-medium text-ec-ink-3">/mo</span>}
              </p>
              {tier.id === "enterprise" && <p className="mt-0.5 text-xs font-medium text-ec-ink-3">{t("pricing.fromSeat")}</p>}
              <ul className="my-5 flex-1 space-y-0">
                {tier.features.map((feat) => (
                  <li key={feat} className="border-t border-ec-hair py-2 text-[13px] text-ec-ink-2 first:border-t-0">{t(`pricing.tier.${tier.id}.f.${feat}`)}</li>
                ))}
              </ul>
              <Link href="/login" className={`ec-btn justify-center ${tier.hot ? "ec-btn-brass" : "ec-btn-ghost"}`}>{t(`pricing.cta.${tier.cta}`)}</Link>
            </div>
          ))}
        </div>
      </section>

      {/* footer */}
      <footer className="border-t border-ec-hair bg-ec-paper-3">
        <div className="mx-auto flex max-w-6xl flex-wrap gap-8 px-6 py-10">
          <div className="max-w-xs">
            <span className="flex items-center gap-2">
              <BrandMark size={24} tone="dark" />
              <span className="ec-underline font-display text-xl font-semibold lowercase tracking-tight">{brand.name}</span>
            </span>
            <p className="mt-3 text-[13px] leading-relaxed text-ec-ink-3">{t("footer.tagline")}</p>
          </div>
          <div className="ml-auto flex gap-12">
            {(["product", "company", "legal"] as const).map((col) => (
              <div key={col}>
                <p className="ec-label mb-2">{t(`footer.col.${col}.h`)}</p>
                {(["a", "b", "c"] as const).map((it) => (
                  <Link key={it} href={FOOTER_LINKS[col][it]} className="block py-0.5 text-[13px] text-ec-ink-2 hover:text-ec-brass-deep">{t(`footer.col.${col}.${it}`)}</Link>
                ))}
              </div>
            ))}
          </div>
          <p className="w-full border-t border-ec-hair pt-4 text-[11.5px] leading-relaxed text-ec-ink-3">{t("footer.compliance")}</p>
        </div>
      </footer>
    </div>
  );
}
