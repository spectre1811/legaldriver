"use client";

// WO-333 · Chambers reskin — the roster's live name search. Mirrors the ?q= pattern already
// used by cases-toolbar.tsx, but scoped down: no client-side URL-param hook needed since this
// page only ever carries q/page/per, so a plain router.push is enough (no useSearchParams, no
// Suspense boundary to wire).
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/icons";

export function ClientsSearch({ initialQ }: { initialQ: string }) {
  const t = useTranslations("dashboard.clients");
  const router = useRouter();
  const [q, setQ] = useState(initialQ);
  useEffect(() => setQ(initialQ), [initialQ]);

  const commit = (next: string) => {
    router.push(next ? `/dashboard/clients?q=${encodeURIComponent(next)}` : "/dashboard/clients");
  };

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); commit(q.trim()); }}
      className="relative min-w-[220px] flex-1 sm:max-w-xs"
    >
      <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ec-ink-3" />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onBlur={() => { if (initialQ !== q.trim()) commit(q.trim()); }}
        placeholder={t("searchPlaceholder")}
        aria-label={t("searchAria")}
        className="input pl-9"
        type="search"
      />
    </form>
  );
}
