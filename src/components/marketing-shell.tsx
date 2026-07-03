import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { brand } from "@/lib/brand";
import { LanguageSwitcher } from "@/components/language-switcher";

// Shared chrome for the public secondary pages (legal/company). Editorial
// Chambers, tokened. Content pages compose <MarketingShell><Prose>…</Prose>.
export async function MarketingShell({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  const t = await getTranslations("pages");
  const tl = await getTranslations("landing");
  return (
    <div className="min-h-screen bg-ec-paper text-ec-ink">
      <header className="border-b border-ec-hair">
        <div className="mx-auto flex max-w-3xl items-center gap-4 px-6 py-4">
          <Link href="/" className="ec-underline font-display text-2xl font-semibold lowercase tracking-tight">{brand.name}</Link>
          <div className="ml-auto flex items-center gap-3">
            <LanguageSwitcher className="hidden sm:inline-flex" />
            <Link href="/" className="text-sm font-medium text-ec-ink-2 hover:text-ec-brass-deep">{t("backHome")}</Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="font-display text-[clamp(2rem,4vw,2.75rem)] font-medium leading-tight tracking-tight">{title}</h1>
        {subtitle && <p className="mt-3 text-[17px] leading-relaxed text-ec-ink-2">{subtitle}</p>}
        <div className="mt-8">{children}</div>
      </main>

      <footer className="border-t border-ec-hair bg-ec-paper-3">
        <div className="mx-auto max-w-3xl px-6 py-8">
          <Link href="/" className="ec-underline font-display text-lg font-semibold lowercase tracking-tight">{brand.name}</Link>
          <p className="mt-3 text-[11.5px] leading-relaxed text-ec-ink-3">{tl("footer.compliance")}</p>
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
