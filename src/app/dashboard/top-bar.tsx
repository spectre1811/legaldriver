"use client";

// Desktop top bar (≥md) — WO-147 design-system-v2 §5 shell.
// Breadcrumb · ⌘K search · + New · notifications · profile menu.
// Below md the sticky MobileNav takes over; this bar is hidden there.
// Replaces the old sidebar-footer account block (avatar + language + sign out
// now live in the profile menu). Avatar is initials on bronze tint — there is
// no profile photo field yet, so no gray silhouette and nothing fabricated.
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/icons";
import { CommandPalette } from "@/components/command-palette";
import { LanguageSwitcher } from "@/components/language-switcher";
import { NAV_TARGETS } from "./nav";

type Props = { email: string; initial: string; fullName: string | null; designation: string | null };

function Avatar({ initial }: { initial: string }) {
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ec-bronze-tint text-sm font-semibold text-ec-ink ring-1 ring-ec-hair">
      {initial}
    </span>
  );
}

export function TopBar({ email, initial, fullName, designation }: Props) {
  const t = useTranslations("shell");
  const tn = useTranslations("nav");
  const pathname = usePathname();

  // Breadcrumb section = the longest nav href (excluding home) that prefixes the path.
  const section = NAV_TARGETS
    .filter((n) => n.href !== "/dashboard" && pathname.startsWith(n.href))
    .sort((a, b) => b.href.length - a.href.length)[0];

  return (
    <header className="sticky top-0 z-30 hidden h-14 items-center gap-3 border-b border-ec-hair bg-ec-paper/90 px-5 backdrop-blur md:flex lg:px-8">
      <nav aria-label={t("breadcrumb")} className="flex min-w-0 items-center gap-1.5 text-sm">
        <Link
          href="/dashboard"
          className="shrink-0 rounded-ec-s text-ec-ink-3 transition hover:text-ec-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ec-indigo"
        >
          {t("home")}
        </Link>
        {section && (
          <>
            <Icon name="chevron" className="h-3.5 w-3.5 shrink-0 text-ec-ink-3" />
            <span className="truncate font-medium text-ec-ink">{tn(`item.${section.label}`)}</span>
          </>
        )}
      </nav>

      <div className="ml-auto flex items-center gap-2">
        <CommandPalette compact />
        <Link
          href="/dashboard/cases"
          className="inline-flex h-9 items-center gap-1.5 rounded-ec-s bg-ec-ink px-3 text-sm font-medium text-ec-paper transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ec-indigo"
        >
          <Icon name="plus" className="h-4 w-4" />
          <span className="hidden sm:inline">{t("newCase")}</span>
        </Link>
        <Link
          href="/dashboard/notifications"
          aria-label={tn("item.notifications")}
          className="flex h-9 w-9 items-center justify-center rounded-ec-s text-ec-ink-3 transition hover:bg-ec-paper-3 hover:text-ec-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ec-indigo"
        >
          <Icon name="bell" className="h-[1.15rem] w-[1.15rem]" />
        </Link>
        <ProfileMenu email={email} initial={initial} fullName={fullName} designation={designation} />
      </div>
    </header>
  );
}

function ProfileMenu({ email, initial, fullName, designation }: Props) {
  const t = useTranslations("shell");
  const tn = useTranslations("nav");
  const tl = useTranslations("common.language");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  useEffect(() => setOpen(false), [pathname]); // close on navigation

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [open]);

  const item =
    "flex w-full items-center gap-2.5 rounded-ec-s px-2.5 py-2 text-left text-sm text-ec-ink-2 transition hover:bg-ec-paper-3 hover:text-ec-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ec-indigo";
  const ico = "h-4 w-4 shrink-0 text-ec-ink-3";

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t("profileMenu")}
        className="flex items-center gap-2 rounded-ec-s py-1 pl-1 pr-1.5 transition hover:bg-ec-paper-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ec-indigo"
      >
        <Avatar initial={initial} />
        <span className="hidden min-w-0 text-left leading-tight lg:block">
          <span className="block max-w-[10rem] truncate text-sm font-medium text-ec-ink">{fullName || email}</span>
          {designation && <span className="block max-w-[10rem] truncate text-xs text-ec-ink-3">{designation}</span>}
        </span>
        <Icon
          name="chevron"
          className={`hidden h-3.5 w-3.5 shrink-0 text-ec-ink-3 transition lg:block ${open ? "-rotate-90" : "rotate-90"}`}
        />
      </button>

      {open && (
        <div
          role="menu"
          aria-label={t("profileMenu")}
          className="absolute right-0 top-full z-40 mt-1.5 w-64 rounded-ec-m border border-ec-hair bg-ec-paper p-1.5 shadow-ec-2"
        >
          <div className="flex items-center gap-2.5 px-2.5 py-2">
            <Avatar initial={initial} />
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium text-ec-ink">{fullName || t("workspace")}</span>
              <span className="block truncate text-xs text-ec-ink-3" title={email}>{email}</span>
            </span>
          </div>
          <div className="my-1 border-t border-ec-hair" />
          <Link role="menuitem" href="/dashboard/settings#profile" className={item}>
            <Icon name="clients" className={ico} />
            {t("profile")}
          </Link>
          <Link role="menuitem" href="/dashboard/settings" className={item}>
            <Icon name="settings" className={ico} />
            {tn("item.settings")}
          </Link>
          <Link role="menuitem" href="/dashboard/settings#billing" className={item}>
            <Icon name="invoice" className={ico} />
            {t("billing")}
          </Link>
          <div className="my-1 border-t border-ec-hair" />
          <div className="flex items-center justify-between gap-2 px-2.5 py-2">
            <span className="text-xs text-ec-ink-3">{tl("label")}</span>
            <LanguageSwitcher />
          </div>
          <div className="my-1 border-t border-ec-hair" />
          <form action="/auth/signout" method="post">
            <button role="menuitem" type="submit" className={item}>
              <Icon name="logout" className={ico} />
              {t("signOut")}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
