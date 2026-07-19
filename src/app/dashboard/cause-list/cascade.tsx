"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Combobox, type ComboOption, RENDER_ALL_MAX } from "@/components/combobox";
import type { Tier } from "@/lib/court/court-directory";

// WO-205 W3 · The cause-list picker cascade — ONE instrument, four decisions:
//   State → Tier (segmented, not a dropdown — only two values) → District (District tier only) → Court.
// URL-driven (the search/judgments idiom): every pick pushes a param and the server re-renders the
// board. Options are built server-side (held-only) and passed in, so this stays a thin controlled
// shell. Tier is a segmented toggle because a 2-value choice as a searchable combobox reads as noise;
// the toggle makes the tier the visible spine of the instrument. District animates in only for the
// District tier (a High Court has no district level). Date stays on the stepper in page.tsx (the
// `?date=` back-compat contract is untouched); state/tier/district/court_id are additive.

export function CauseListCascade({
  states,
  tiers,
  districts,
  courts,
  stateCode,
  tier,
  district,
  courtId,
}: {
  states: ComboOption[];
  tiers: Tier[];
  districts: ComboOption[];
  courts: ComboOption[];
  stateCode: string | null;
  tier: Tier | null;
  district: string | null;
  courtId: string | null;
}) {
  const t = useTranslations("causeList.scope");
  const router = useRouter();
  const sp = useSearchParams();

  // Push a mutated param set; a scope change always clears the params it invalidates downstream, so
  // the cascade never carries a stale district/court from a different state or tier.
  const push = (mutate: (p: URLSearchParams) => void) => {
    const next = new URLSearchParams(sp.toString());
    mutate(next);
    router.push(`/dashboard/cause-list?${next.toString()}`);
  };

  const setState = (v: string | null) =>
    push((p) => {
      if (v) p.set("state", v);
      else p.delete("state");
      p.delete("tier");
      p.delete("district");
      p.delete("court_id"); // a different state has a different directory
    });

  const setTier = (v: Tier) =>
    push((p) => {
      p.set("tier", v);
      p.delete("district"); // district is a District-tier concept
      p.delete("court_id"); // the court list changes with the tier
    });

  const setDistrict = (v: string | null) =>
    push((p) => {
      if (v) p.set("district", v);
      else p.delete("district");
      p.delete("court_id"); // a different district has a different court list
    });

  const setCourt = (v: string | null) =>
    push((p) => {
      if (v) p.set("court_id", v);
      else p.delete("court_id");
    });

  const isDistrict = tier === "DISTRICT";
  const courtDisabled = courts.length === 0 || (isDistrict && !district);

  return (
    <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
      {/* 1 · State */}
      <Field label={t("stateLabel")}>
        <Combobox
          label={t("stateLabel")}
          placeholder={t("statePlaceholder")}
          options={states}
          value={stateCode}
          onChange={setState}
          clearable={false}
          className="w-full min-w-[11rem] sm:w-auto sm:max-w-[15rem]"
        />
      </Field>

      {/* 2 · Tier — segmented toggle (the spine of the instrument). Only tiers we hold are offered. */}
      {tiers.length > 0 && (
        <Field label={t("tierLabel")}>
          <div
            role="group"
            aria-label={t("tierLabel")}
            className="inline-flex rounded-ec-s border border-ec-hair bg-ec-paper-2 p-0.5"
          >
            {tiers.map((tv) => {
              const active = tv === tier;
              return (
                <button
                  key={tv}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setTier(tv)}
                  className={`rounded-[5px] px-3 py-[7px] text-[13px] font-medium transition-colors ${
                    active
                      ? "bg-ec-ink text-ec-paper-2 shadow-sm"
                      : "text-ec-ink-3 hover:text-ec-ink"
                  }`}
                >
                  {tv === "HIGH" ? t("tierHigh") : t("tierDistrict")}
                </button>
              );
            })}
          </div>
        </Field>
      )}

      {/* 3 · District — District tier only. */}
      {isDistrict && (
        <Field label={t("districtLabel")}>
          <Combobox
            label={t("districtLabel")}
            placeholder={districts.length ? t("districtPlaceholder") : t("districtNone")}
            options={districts}
            value={district}
            onChange={setDistrict}
            disabled={districts.length === 0}
            virtualized={districts.length > RENDER_ALL_MAX}
            className="w-full min-w-[11rem] sm:w-auto sm:max-w-[15rem]"
          />
        </Field>
      )}

      {/* 4 · Court / complex — narrowed by tier + district. */}
      <Field label={t("courtLabel")}>
        <Combobox
          label={t("courtLabel")}
          placeholder={
            courtDisabled ? (isDistrict && !district ? t("courtPickDistrict") : t("courtNone")) : t("courtPlaceholder")
          }
          options={courts}
          value={courtId}
          onChange={setCourt}
          disabled={courtDisabled}
          virtualized={courts.length > RENDER_ALL_MAX}
          className="w-full min-w-[13rem] sm:w-auto sm:max-w-[22rem]"
        />
      </Field>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex w-full flex-col gap-1.5 sm:w-auto">
      <span className="ec-label">{label}</span>
      {children}
    </div>
  );
}
