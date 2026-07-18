"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Combobox, type ComboOption, RENDER_ALL_MAX } from "@/components/combobox";

// WO-205 W1 · State + court pickers for the console cause-list board. URL-driven (the same idiom as
// search/judgments/filters.tsx): each pick pushes a search param and the server re-renders the board.
// Court options are built server-side (only courts we hold boards for — court-directory.ts
// buildCourtOptions) and passed in, so this stays a thin controlled shell. Date stays on the
// existing stepper in page.tsx (the `?date=` back-compat contract is untouched).

export function CauseListPickers({
  states,
  courts,
  stateCode,
  courtId,
}: {
  states: ComboOption[];
  courts: ComboOption[];
  stateCode: string | null;
  courtId: string | null;
}) {
  const t = useTranslations("causeList.scope");
  const router = useRouter();
  const sp = useSearchParams();

  const push = (next: URLSearchParams) => router.push(`/dashboard/cause-list?${next.toString()}`);

  const setState = (v: string | null) => {
    const next = new URLSearchParams(sp.toString());
    if (v) next.set("state", v); else next.delete("state");
    next.delete("court_id"); // a different state has a different directory — clear the stale court
    push(next);
  };

  const setCourt = (v: string | null) => {
    const next = new URLSearchParams(sp.toString());
    if (v) next.set("court_id", v); else next.delete("court_id");
    push(next);
  };

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1.5">
        <span className="ec-label">{t("stateLabel")}</span>
        <Combobox
          label={t("stateLabel")}
          placeholder={t("statePlaceholder")}
          options={states}
          value={stateCode}
          onChange={setState}
          clearable={false}
          className="min-w-[12rem] max-w-[16rem]"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="ec-label">{t("courtLabel")}</span>
        <Combobox
          label={t("courtLabel")}
          placeholder={courts.length ? t("courtPlaceholder") : t("courtNone")}
          options={courts}
          value={courtId}
          onChange={setCourt}
          disabled={courts.length === 0}
          virtualized={courts.length > RENDER_ALL_MAX}
          className="min-w-[14rem] max-w-[22rem]"
        />
      </div>
    </div>
  );
}
