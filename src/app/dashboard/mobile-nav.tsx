"use client";

// Mobile navigation (WO-03 Wave 3) — closes the known "mobile nav drawer TODO".
// A sticky top bar (< md) with the wordmark + a hamburger that opens a slide-in
// drawer reusing the desktop NavLinks. Desktop keeps the persistent sidebar.
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { NavLinks, AccountNav } from "./nav";
import { Avatar, AccountLinks } from "./top-bar";
import { Icon } from "@/components/icons";
import { brand } from "@/lib/brand";

type Props = {
  email: string;
  tenantName: string;
  initial: string;
  isAdmin?: boolean;
  fullName?: string | null;
  designation?: string | null;
  photoUrl?: string | null;
};

export function MobileNav({ email, tenantName, initial, isAdmin = false, fullName = null, designation = null, photoUrl = null }: Props) {
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
        <Link href="/dashboard" aria-label={t("home")} className="ec-underline font-display text-xl font-semibold lowercase tracking-tight text-ec-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ec-indigo">{brand.name}</Link>
        {/* WO-328: the ONE "+ New case" action needs a path below md too — the desktop top bar
            (with its button) is hidden here, and no nav item covers "add a case". */}
        <Link
          href="/dashboard/cases?add=1"
          aria-label={t("newCase")}
          className="ml-auto flex h-9 w-9 items-center justify-center rounded-ec-s bg-ec-ink text-ec-paper transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ec-honey"
        >
          <Icon name="plus" className="h-4 w-4" />
        </Link>
      </header>

      {open && (
        <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true" aria-label={t("nav")}>
          <div className="absolute inset-0 bg-ec-ink/40" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85%] flex-col border-r border-ec-hair bg-ec-paper px-4 py-5 shadow-ec-2">
            <div className="flex items-center justify-between px-2">
              <Link href="/dashboard" aria-label={t("home")} className="ec-underline font-display text-2xl font-semibold lowercase tracking-tight text-ec-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ec-indigo">{brand.name}</Link>
              <button
                onClick={() => setOpen(false)}
                aria-label={t("closeNav")}
                className="flex h-9 w-9 items-center justify-center rounded-ec-s text-ec-ink-3 transition hover:bg-ec-paper-3 hover:text-ec-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ec-indigo"
              >
                <Icon name="close" className="h-5 w-5" />
              </button>
            </div>
            <p className="mt-1.5 truncate px-2 text-xs text-ec-ink-3" title={tenantName}>{tenantName}</p>
            <div className="mt-6 flex-1 overflow-y-auto"><NavLinks isAdmin={isAdmin} /></div>
            {/* Settings pinned at the foot, same as desktop (WO-328) — outside the scroll region. */}
            <div className="mt-4 border-t border-ec-hair pt-3"><AccountNav /></div>
            {/* Full account block — parity with the desktop profile dropdown (same order:
                header · Profile · Settings · Billing · Language · Sign out · Sign out everywhere). */}
            <div className="mt-3 border-t border-ec-hair pt-3">
              <div className="flex items-center gap-2.5 px-1 pb-2">
                <Avatar initial={initial} photoUrl={photoUrl} name={fullName ?? email} />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-ec-ink">{fullName || email}</span>
                  {designation ? (
                    <span className="block truncate text-xs text-ec-ink-3">{designation}</span>
                  ) : (
                    <span className="block truncate text-xs text-ec-ink-3" title={email}>{email}</span>
                  )}
                </span>
              </div>
              <AccountLinks menu={false} showSettings={false} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
