"use client";

// Desktop top bar (≥md) — WO-147 design-system-v2 §5 shell, reskinned WO-345 for prototype
// fidelity (design-mockups/iteration3/console/app-shell.tsx:337-373).
// Breadcrumb ("Home › X", literal "›" glyph) · ⌘K search · outlined "+ New case" · notification
// bell DROPDOWN (real recent alerts) · profile menu.
// Below md the sticky MobileNav takes over; this bar is hidden there.
// Avatar = the uploaded photo (signed URL) when set, else initials on the bronze tint (never a
// gray silhouette — honesty §7b).
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/icons";
import { CommandPalette } from "@/components/command-palette";
import { LanguageSwitcher } from "@/components/language-switcher";
import { NAV_TARGETS } from "./nav";

type AlertItem = { id: string; label: string; title: string | null; when: string };
type Props = {
  email: string;
  initial: string;
  fullName: string | null;
  designation: string | null;
  photoUrl?: string | null;
  alerts: AlertItem[];
};

// Shared avatar — one primitive for the desktop top bar AND the mobile drawer (never fork this).
// WO-345: bronze-tint/bronze-deep + serif initial (app-shell.tsx:167-169), replacing the old
// honey-tint pairing.
export function Avatar({ initial, photoUrl, name }: { initial: string; photoUrl?: string | null; name?: string }) {
  if (photoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- signed one-off URL, not a static asset
      <img src={photoUrl} alt={name ?? ""} className="h-8 w-8 shrink-0 rounded-full object-cover ring-1 ring-ec-hair" />
    );
  }
  return (
    <span className="display flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ec-bronze-tint text-sm text-ec-bronze-deep">
      {initial}
    </span>
  );
}

export function TopBar({ email, initial, fullName, designation, photoUrl, alerts }: Props) {
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
          className="shrink-0 rounded-ec-s text-ec-muted-ink transition hover:text-ec-ink-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ec-honey"
        >
          {t("home")}
        </Link>
        {section && (
          <>
            <span className="mx-0.5 text-ec-line-strong">›</span>
            <span className="truncate text-ec-ink-2">{tn(`item.${section.label}`)}</span>
          </>
        )}
      </nav>

      <div className="ml-auto flex items-center gap-2">
        <CommandPalette compact />
        <Link
          href="/dashboard/cases?add=1"
          className="inline-flex h-9 items-center gap-1.5 rounded-ec-s border border-ec-line bg-ec-card px-2.5 text-[12.5px] text-ec-ink-2 transition hover:border-ec-line-strong hover:bg-ec-paper-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ec-honey"
        >
          <Icon name="plus" className="h-3.5 w-3.5" />
          {t("newCase")}
        </Link>
        <BellMenu alerts={alerts} />
        <ProfileMenu email={email} initial={initial} fullName={fullName} designation={designation} photoUrl={photoUrl} />
      </div>
    </header>
  );
}

// Notification bell dropdown (app-shell.tsx:47-122) — "Latest alerts": real recent `notification`
// rows (resolved + i18n'd server-side in layout.tsx), a honey unread dot ONLY when there's
// something to show (honest — never a decorative dot on an empty feed), and a footer link to the
// full Notifications page. Never a dead link.
function BellMenu({ alerts }: { alerts: AlertItem[] }) {
  const t = useTranslations("shell");
  const tn = useTranslations("nav");
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => setOpen(false), [pathname]);

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

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={tn("item.notifications")}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`relative flex h-9 w-9 items-center justify-center rounded-ec-s text-ec-ink-2 transition hover:bg-ec-paper-3 hover:text-ec-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ec-honey ${open ? "bg-ec-paper-3" : ""}`}
      >
        <Icon name="bell" className="h-[1.15rem] w-[1.15rem]" />
        {alerts.length > 0 && <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-ec-honey" />}
      </button>

      {open && (
        <div
          role="menu"
          aria-label={t("bell.heading")}
          className="absolute right-0 top-full z-40 mt-1.5 w-[min(20rem,calc(100vw-2rem))] rounded-ec-m border border-ec-line bg-ec-card p-1.5 shadow-ec-2"
        >
          <div className="flex items-baseline justify-between px-2.5 py-1.5">
            <span className="eyebrow">{t("bell.heading")}</span>
            {alerts.length > 0 && <span className="num font-mono text-[10.5px] text-ec-muted-ink">{alerts.length}</span>}
          </div>
          <div className="my-1 h-px bg-ec-line" />
          {alerts.length === 0 ? (
            <p className="px-2.5 py-4 text-center text-[12.5px] text-ec-muted-ink">{t("bell.empty")}</p>
          ) : (
            <ul className="max-h-[19rem] overflow-y-auto">
              {alerts.map((a) => (
                <li key={a.id}>
                  <Link
                    href="/dashboard/notifications"
                    onClick={() => setOpen(false)}
                    className="block rounded-ec-s px-2.5 py-2 transition hover:bg-ec-paper-3"
                  >
                    <div className="text-[12.5px] leading-snug text-ec-ink">{a.label}</div>
                    <div className="mt-0.5 flex items-baseline justify-between gap-2">
                      <span className="display truncate text-[12.5px] text-ec-ink-2">{a.title ?? "—"}</span>
                      <span className="num shrink-0 font-mono text-[10.5px] text-ec-muted-ink">{a.when}</span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <div className="my-1 h-px bg-ec-line" />
          <Link
            href="/dashboard/notifications"
            onClick={() => setOpen(false)}
            className="block rounded-ec-s px-2.5 py-1.5 text-[12.5px] text-ec-bronze transition hover:bg-ec-bronze-tint"
          >
            {t("bell.viewAll")}
          </Link>
        </div>
      )}
    </div>
  );
}

// Shared account link list — Profile · Billing · Language · Sign out · Sign out everywhere.
// WO-345: Settings REMOVED from here (it now lives only in the sidebar footer, nav.tsx
// SidebarFooter — the founder's "2 settings" fix), and Profile/Language rows now carry icons
// matching app-shell.tsx's ProfileMenu (UserRound→person, Languages→language). Reused verbatim
// by the desktop dropdown AND the 390px drawer footer so the two surfaces can never drift apart
// (never inline-fork this). `menu=false` (drawer context) drops the ARIA menuitem role, which
// only makes sense under an ancestor with role="menu" (the dropdown has one; the drawer,
// role="dialog", does not).
export function AccountLinks({ menu = true }: { menu?: boolean }) {
  const t = useTranslations("shell");
  const tl = useTranslations("common.language");
  const role = menu ? "menuitem" : undefined;
  const item =
    "flex w-full items-center gap-2.5 rounded-ec-s px-2.5 py-2 text-left text-sm text-ec-ink-2 transition hover:bg-ec-paper-3 hover:text-ec-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ec-honey";
  const ico = "h-4 w-4 shrink-0 text-ec-ink-3";
  return (
    <>
      <Link role={role} href="/dashboard/settings#profile" className={item}>
        <Icon name="person" className={ico} />
        {t("profile")}
      </Link>
      <Link role={role} href="/dashboard/settings#billing" className={item}>
        <Icon name="invoice" className={ico} />
        {t("billing")}
      </Link>
      <div className="my-1 border-t border-ec-hair" />
      <div className="flex items-center justify-between gap-2 px-2.5 py-2">
        <span className="flex items-center gap-2.5 text-xs text-ec-ink-3">
          <Icon name="language" className={ico} />
          {tl("label")}
        </span>
        <LanguageSwitcher tone="bronze" />
      </div>
      <div className="my-1 border-t border-ec-hair" />
      <form action="/auth/signout" method="post">
        <button role={role} type="submit" className={item}>
          <Icon name="logout" className={ico} />
          {t("signOut")}
        </button>
      </form>
      {/* WO-316 — opt-in global revocation: kills every session this account holds,
          on every device. The only "I think I'm compromised" control we have. */}
      <form action="/auth/signout" method="post">
        <input type="hidden" name="scope" value="global" />
        <button role={role} type="submit" className="w-full rounded-ec-s px-2.5 py-1.5 pl-[38px] text-left text-[11.5px] text-ec-muted-ink transition hover:bg-ec-paper-3 hover:text-ec-ink-2">
          {t("signOutEverywhere")}
        </button>
      </form>
    </>
  );
}

function ProfileMenu({ email, initial, fullName, designation, photoUrl }: Omit<Props, "alerts">) {
  const t = useTranslations("shell");
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

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t("profileMenu")}
        className="flex items-center gap-2 rounded-ec-s py-1 pl-1 pr-1.5 transition hover:bg-ec-paper-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ec-honey"
      >
        <Avatar initial={initial} photoUrl={photoUrl} name={fullName ?? email} />
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
            <Avatar initial={initial} photoUrl={photoUrl} name={fullName ?? email} />
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium text-ec-ink">{fullName || t("workspace")}</span>
              <span className="block truncate text-xs text-ec-ink-3" title={email}>{email}</span>
            </span>
          </div>
          <div className="my-1 border-t border-ec-hair" />
          <AccountLinks />
        </div>
      )}
    </div>
  );
}
