"use client";

// Mobile navigation (WO-03 Wave 3) — closes the known "mobile nav drawer TODO".
// A sticky top bar (< md) with the wordmark + a hamburger that opens a slide-in
// drawer reusing the desktop NavLinks. Desktop keeps the persistent sidebar.
// WO-345: drawer footer now carries the pinned Settings link (SidebarFooter, matching the
// desktop aside exactly — never inline-fork it) ABOVE the account block, and the drawer's
// subtitle switched from the tenant name to मुक़दमा (same fix as layout.tsx's aside — this
// drawer IS the mobile copy of that same sidebar). Also adds the fixed bottom tab bar
// (app-shell.tsx:378-396) — new, live had none. Breakpoint is `md`, not the prototype's `lg`:
// this app's persistent sidebar/top-bar already switch at md (layout.tsx, top-bar.tsx), so
// `lg:hidden` here would double-render the bottom bar alongside the desktop sidebar in the
// md–lg range.
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { NAV, NavLinks, SidebarFooter, useIsActive } from "./nav";
import { Avatar, AccountLinks } from "./top-bar";
import { Icon } from "@/components/icons";
import { brand } from "@/lib/brand";

type Props = {
  email: string;
  initial: string;
  isAdmin?: boolean;
  fullName?: string | null;
  designation?: string | null;
  photoUrl?: string | null;
};

export function MobileNav({
  email,
  initial,
  isAdmin = false,
  fullName = null,
  designation = null,
  photoUrl = null,
}: Props) {
  const [open, setOpen] = useState(false);
  const t = useTranslations("shell");
  const tn = useTranslations("nav");
  const pathname = usePathname();
  const isActive = useIsActive();

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
            <p className="mt-1.5 truncate px-2 text-xs text-ec-ink-3" title={brand.nameDevanagari} lang="hi">{brand.nameDevanagari}</p>
            <div className="mt-6 flex-1 overflow-y-auto"><NavLinks isAdmin={isAdmin} /></div>
            <SidebarFooter />
            {/* Full account block — parity with the desktop profile dropdown (same order:
                header · Profile · Billing · Language · Sign out · Sign out everywhere). */}
            <div className="mt-4 border-t border-ec-hair pt-3">
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
              <AccountLinks menu={false} />
            </div>
          </div>
        </div>
      )}

      {/* Fixed bottom tab bar (app-shell.tsx:378-396) — first 5 Console items, always the same
          5 regardless of admin (the admin-only Access-requests item never takes a scarce tab). */}
      <nav aria-label={tn("ariaMain")} className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-ec-line bg-ec-card md:hidden">
        {NAV.slice(0, 5).map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`flex flex-col items-center gap-0.5 py-2 text-[10px] ${active ? "text-ec-bronze-deep" : "text-ec-muted-ink"}`}
            >
              <Icon name={item.icon} className="h-4 w-4" />
              <span className="max-w-full truncate px-1">{tn(`item.${item.label}`).split(" ")[0]}</span>
              {active && <span className="h-[2px] w-5 rounded-full bg-ec-honey" />}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
