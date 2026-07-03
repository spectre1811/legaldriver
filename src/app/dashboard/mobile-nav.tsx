"use client";

// Mobile navigation (WO-03 Wave 3) — closes the known "mobile nav drawer TODO".
// A sticky top bar (< md) with the wordmark + a hamburger that opens a slide-in
// drawer reusing the desktop NavLinks. Desktop keeps the persistent sidebar.
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { NavLinks } from "./nav";
import { Icon } from "@/components/icons";
import { LanguageSwitcher } from "@/components/language-switcher";
import { brand } from "@/lib/brand";

export function MobileNav({ email, tenantName, initial }: { email: string; tenantName: string; initial: string }) {
  const [open, setOpen] = useState(false);
  const t = useTranslations("shell");
  const pathname = usePathname();

  // Close on navigation.
  useEffect(() => setOpen(false), [pathname]);

  // While open: close on Escape and lock background scroll.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-ec-hair bg-ec-paper/90 px-4 py-3 backdrop-blur md:hidden">
        <button
          onClick={() => setOpen(true)}
          aria-label={t("openNav")}
          aria-expanded={open}
          className="flex h-9 w-9 items-center justify-center rounded-ec-s text-ec-ink-2 transition hover:bg-ec-paper-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ec-indigo"
        >
          <Icon name="menu" className="h-5 w-5" />
        </button>
        <span className="ec-underline font-display text-xl font-semibold lowercase tracking-tight text-ec-ink">{brand.name}</span>
      </header>

      {open && (
        <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true" aria-label={t("nav")}>
          <div className="absolute inset-0 bg-ec-ink/40" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85%] flex-col border-r border-ec-hair bg-ec-paper px-4 py-5 shadow-ec-2">
            <div className="flex items-center justify-between px-2">
              <span className="ec-underline font-display text-2xl font-semibold lowercase tracking-tight text-ec-ink">{brand.name}</span>
              <button
                onClick={() => setOpen(false)}
                aria-label={t("closeNav")}
                className="flex h-9 w-9 items-center justify-center rounded-ec-s text-ec-ink-3 transition hover:bg-ec-paper-3 hover:text-ec-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ec-indigo"
              >
                <Icon name="close" className="h-5 w-5" />
              </button>
            </div>
            <p className="mt-1.5 truncate px-2 text-xs text-ec-ink-3" title={tenantName}>{tenantName}</p>
            <div className="mt-6 flex-1 overflow-y-auto"><NavLinks /></div>
            <div className="mt-4 border-t border-ec-hair pt-4">
              <div className="mb-3 px-1"><LanguageSwitcher /></div>
              <div className="flex items-center gap-3 px-1">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ec-indigo text-sm font-semibold text-white">{initial}</span>
                <p className="min-w-0 flex-1 truncate text-xs text-ec-ink-2" title={email}>{email}</p>
                <form action="/auth/signout" method="post">
                  <button className="flex h-8 w-8 items-center justify-center rounded-ec-s text-ec-ink-3 transition hover:bg-ec-paper-3 hover:text-ec-ink" title={t("signOut")} aria-label={t("signOut")}>
                    <Icon name="logout" className="h-4 w-4" />
                  </button>
                </form>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
