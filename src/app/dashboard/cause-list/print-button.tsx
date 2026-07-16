"use client";

import { useTranslations } from "next-intl";
import { Icon } from "@/components/icons";

// Print the board via the browser's own print dialog. Real action, no server round-trip.
export function PrintButton() {
  const t = useTranslations("causeList");
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex h-9 items-center gap-1.5 rounded-ec-s border border-ec-hair-strong bg-ec-paper-2 px-3 text-[12.5px] font-medium text-ec-ink transition-colors hover:bg-ec-paper-3"
    >
      <Icon name="printer" className="h-3.5 w-3.5" />
      {t("well.print")}
    </button>
  );
}
