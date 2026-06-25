"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/icons";

const SECTIONS: { heading: string; items: { href: string; label: string; icon: IconName }[] }[] = [
  {
    heading: "Practice",
    items: [
      { href: "/dashboard", label: "Overview", icon: "overview" },
      { href: "/dashboard/clients", label: "Clients", icon: "overview" },
      { href: "/dashboard/cases", label: "Cases", icon: "cases" },
      { href: "/dashboard/calendar", label: "Calendar", icon: "calendar" },
    ],
  },
  {
    heading: "Workflow",
    items: [
      { href: "/dashboard/notices", label: "Notices", icon: "notices" },
      { href: "/dashboard/inbox", label: "Inbox", icon: "inbox" },
      { href: "/dashboard/documents", label: "Documents", icon: "documents" },
      { href: "/dashboard/ip", label: "IP assets", icon: "scale" },
      { href: "/dashboard/notifications", label: "Notifications", icon: "bell" },
    ],
  },
  {
    heading: "Account",
    items: [{ href: "/dashboard/settings", label: "Settings", icon: "settings" }],
  },
];

export function NavLinks() {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(href);

  return (
    <nav className="flex flex-col gap-6" aria-label="Main">
      {SECTIONS.map((section) => (
        <div key={section.heading}>
          <p className="label mb-2 px-3">{section.heading}</p>
          <div className="flex flex-col gap-0.5">
            {section.items.map((item) => {
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`group flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition focus:outline-none focus:shadow-focus ${
                    active
                      ? "bg-brand-600 text-white shadow-sm"
                      : "text-ink-soft hover:bg-paper hover:text-ink"
                  }`}
                >
                  <Icon name={item.icon} className={`h-[1.15rem] w-[1.15rem] ${active ? "text-white" : "text-ink-faint group-hover:text-brand-500"}`} />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}
