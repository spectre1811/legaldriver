import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { brand } from "@/lib/brand";
import { BrandMark } from "@/components/brand-mark";
import { LanguageSwitcher } from "@/components/language-switcher";
import { grievanceOfficer, hasGrievanceOfficer } from "@/lib/site-config";

// Shared chrome for the public secondary pages (legal/company). Editorial
// Chambers, tokened. Content pages compose <MarketingShell><Prose>…</Prose>.
export async function MarketingShell({
  title,
  subtitle,
  effectiveDate,
  children,
}: {
  title: string;
  subtitle?: string;
  /** WO-291: legal pages (privacy/terms/refund/cancellation) stamp this — see
   *  `site-config.legalEffectiveDate`. Omit for non-legal secondary pages. */
  effectiveDate?: string;
  children: React.ReactNode;
}) {
  const t = await getTranslations("pages");
  const tl = await getTranslations("landing");
  return (
    <div className="min-h-screen bg-ec-paper text-ec-ink">
      <header className="border-b border-ec-hair">
        <div className="mx-auto flex max-w-3xl items-center gap-4 px-6 py-4">
          <Link href="/" className="flex items-center gap-2.5">
            <BrandMark size={28} tone="dark" />
            <span className="ec-underline font-display text-2xl font-semibold lowercase tracking-tight">{brand.name}</span>
          </Link>
          <div className="ml-auto flex items-center gap-3">
            <LanguageSwitcher className="hidden sm:inline-flex" />
            <Link href="/" className="text-sm font-medium text-ec-ink-2 hover:text-ec-brass-deep">{t("backHome")}</Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="font-display text-[clamp(2rem,4vw,2.75rem)] font-medium leading-tight tracking-tight">{title}</h1>
        {subtitle && <p className="mt-3 text-[17px] leading-relaxed text-ec-ink-2">{subtitle}</p>}
        {effectiveDate && <p className="mt-2 text-[13px] text-ec-ink-3">{t("effectiveDate", { date: effectiveDate })}</p>}
        <div className="mt-8">{children}</div>
      </main>

      <footer className="border-t border-ec-hair bg-ec-paper-3">
        <div className="mx-auto max-w-3xl px-6 py-8">
          <Link href="/" className="inline-flex items-center gap-2">
            <BrandMark size={22} tone="dark" />
            <span className="ec-underline font-display text-lg font-semibold lowercase tracking-tight">{brand.name}</span>
          </Link>
          {/* WO-127 · trust nav — the legal/company secondary pages now cross-link the full set
              (the landing footer already does; this closes the gap on the pages themselves). */}
          <nav aria-label={tl("footer.col.legal.h")} className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-[13px]">
            <Link href="/privacy" className="text-ec-ink-2 hover:text-ec-brass-deep">{tl("footer.col.legal.a")}</Link>
            <Link href="/terms" className="text-ec-ink-2 hover:text-ec-brass-deep">{tl("footer.col.legal.b")}</Link>
            <Link href="/refund" className="text-ec-ink-2 hover:text-ec-brass-deep">{tl("footer.col.legal.d")}</Link>
            <Link href="/cancellation" className="text-ec-ink-2 hover:text-ec-brass-deep">{tl("footer.col.legal.e")}</Link>
            <Link href="/data-corrections" className="text-ec-ink-2 hover:text-ec-brass-deep">{tl("footer.col.legal.c")}</Link>
            <Link href="/contact" className="text-ec-ink-2 hover:text-ec-brass-deep">{tl("footer.col.company.c")}</Link>
            <Link href="/about" className="text-ec-ink-2 hover:text-ec-brass-deep">{tl("footer.col.company.a")}</Link>
          </nav>
          {/* WO-291 · grievance officer (IT Rules 2021 §3(2)) — same site-config source
              of truth the landing footer reads, so the two surfaces can never drift. */}
          <p className="mt-3 text-[11.5px] leading-relaxed text-ec-ink-3">
            {hasGrievanceOfficer() ? (
              <span>{tl("footer.grievance.label")}: {grievanceOfficer.name} · <a href={`mailto:${grievanceOfficer.email}`} className="hover:text-ec-brass-deep">{grievanceOfficer.email}</a>. </span>
            ) : (
              <span>{tl("footer.grievance.label")}: {tl("footer.grievance.pending")}. </span>
            )}
            {tl("footer.compliance")}
          </p>
        </div>
      </footer>
    </div>
  );
}

// Prose — readable legal/marketing body: tokened headings, paragraphs, lists.
export function Prose({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-5 text-[15px] leading-relaxed text-ec-ink-2 [&_a]:text-ec-brass-deep [&_a:hover]:text-ec-brass [&_h2]:mt-8 [&_h2]:font-display [&_h2]:text-xl [&_h2]:font-medium [&_h2]:text-ec-ink [&_li]:ml-4 [&_li]:list-disc [&_strong]:font-semibold [&_strong]:text-ec-ink [&_ul]:space-y-1.5">
      {children}
    </div>
  );
}

// Draft banner for pages whose final copy is pending legal/counsel review.
export async function DraftNotice() {
  const t = await getTranslations("pages");
  return (
    <p className="mb-6 rounded-ec-s border border-ec-hair-strong bg-ec-warn-t px-4 py-3 text-[13px] text-ec-warn">
      {t("draftNotice")}
    </p>
  );
}
