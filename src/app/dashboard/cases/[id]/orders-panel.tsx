"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { CourtDate } from "@/components/court";
import { Icon } from "@/components/icons";

type Order = { id: string; order_date: string | null; title: string | null; url: string | null; raw: unknown };

// Orders/judgments list with per-order lazy "View full text" (the extracted judgment text comes
// from the court-data platform, fetched on demand via /api/court/order-text). Server renders the
// list; the text panel is client-side so the case page stays fast + resilient to a slow provider.
export function OrdersPanel({ orders }: { orders: Order[] }) {
  const t = useTranslations("caseDetail");
  if (!orders.length) return null;
  return (
    <div className="ec-card">
      <div className="border-b border-ec-hair px-5 py-4">
        <h2 className="font-display text-base font-medium">
          {t("orders.title")} <span className="text-ec-ink-3">({orders.length})</span>
        </h2>
      </div>
      <ul className="divide-y divide-ec-hair">
        {orders.map((o) => (
          <OrderRow key={o.id} o={o} />
        ))}
      </ul>
    </div>
  );
}

function OrderRow({ o }: { o: Order }) {
  const t = useTranslations("caseDetail");
  const orderId = (o.raw as { order_id?: unknown } | null)?.order_id;
  const [open, setOpen] = useState(false);
  const [text, setText] = useState<string | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "empty" | "error">("idle");

  async function toggle() {
    if (open) return setOpen(false);
    setOpen(true);
    if (text !== null || state === "loading") return;
    setState("loading");
    try {
      const r = await fetch(`/api/court/order-text?order=${encodeURIComponent(o.id)}`);
      const d = (await r.json()) as { text?: string | null };
      if (d.text) { setText(d.text); setState("idle"); } else setState("empty");
    } catch {
      setState("error");
    }
  }

  return (
    <li className="px-5 py-3 text-sm">
      <div className="flex items-center gap-3">
        <Icon name="notices" className="h-4 w-4 shrink-0 text-ec-ink-3" />
        <span className="w-24 shrink-0 text-ec-ink-3"><CourtDate value={o.order_date} kind="business" emptyLabel={t("empty.onRecord")} /></span>
        {orderId ? (
          <a href={`/api/court/order-pdf?order=${o.id}`} target="_blank" rel="noopener noreferrer" className="inline-flex min-w-0 flex-1 items-center gap-1.5 truncate font-medium text-ec-brass-deep hover:text-ec-brass">
            <span className="truncate">{o.title}</span>
            <Icon name="external" className="h-3.5 w-3.5 shrink-0" />
          </a>
        ) : o.url ? (
          <a href={o.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-w-0 flex-1 items-center gap-1.5 truncate font-medium text-ec-brass-deep hover:text-ec-brass">
            <span className="truncate">{o.title}</span>
            <Icon name="external" className="h-3.5 w-3.5 shrink-0" />
          </a>
        ) : (
          <span className="min-w-0 flex-1 truncate font-medium text-ec-ink">{o.title}</span>
        )}
        {orderId ? (
          <button type="button" onClick={toggle} className="shrink-0 whitespace-nowrap text-xs font-medium text-ec-brass-deep hover:text-ec-brass">
            {open ? t("orders.hideText") : t("orders.viewText")}
          </button>
        ) : null}
      </div>
      {open ? (
        <div className="mt-2 rounded-ec-s border border-ec-hair bg-ec-paper">
          {state === "loading" ? (
            <p className="px-4 py-3 text-xs text-ec-ink-3">{t("orders.loading")}</p>
          ) : state === "empty" ? (
            <p className="px-4 py-3 text-xs text-ec-ink-3">{t("orders.textNotAvailable")}</p>
          ) : state === "error" ? (
            <p className="px-4 py-3 text-xs text-ec-ink-3">{t("orders.textError")}</p>
          ) : (
            <article className="max-h-[60vh] overflow-auto whitespace-pre-wrap px-4 py-3 font-serif text-[0.9rem] leading-7 text-ec-ink-2">{text}</article>
          )}
        </div>
      ) : null}
    </li>
  );
}
