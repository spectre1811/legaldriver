"use client";

import { useEffect, useMemo, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import { addAdvocate, type ActionResult } from "./actions";
import {
  STATE_BAR_COUNCILS,
  parseBarNumber,
  councilByStatePrefix,
  checkEnrolment,
  canFetchRoster,
} from "@/lib/court/bar-number";
import { Combobox } from "@/components/combobox/combobox";
import { Icon, type IconName } from "@/components/icons";

const initial: ActionResult = { ok: false, message: "" };

const COUNCIL_OPTIONS = STATE_BAR_COUNCILS.map((c) => ({
  value: c.id,
  label: `${c.label}${c.verified ? " ✓" : ""}`,
}));

// A small inline status chip under the enrolment field — the live feedback that turns the old
// "fill it, wait 60s, learn you needed the year" trap into an as-you-type signal.
// WO-349: retoned off tailwind's default amber/emerald/(pre-Chambers) brand scale onto the ec-*
// tokens (tokens.css) — same three tones, no visual behaviour change, just off the palette.
function Chip({ tone, icon, children }: { tone: "amber" | "green" | "brand"; icon: IconName; children: React.ReactNode }) {
  const tones = {
    amber: "bg-ec-warn-t text-ec-warn",
    green: "bg-ec-success-t text-ec-success",
    brand: "bg-ec-bronze-tint text-ec-bronze-deep",
  } as const;
  return (
    <p className={`flex items-start gap-1.5 rounded-lg px-3 py-2 text-xs ${tones[tone]}`}>
      <Icon name={icon} className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

function EnrolmentChip({ raw, councilId }: { raw: string; councilId: string }) {
  const t = useTranslations("settings.advocates");
  const check = checkEnrolment(raw, councilId || null);
  if (check.state === "empty") return null;
  if (check.state === "needs-year") return <Chip tone="amber" icon="alert">{t("checkNeedsYear")}</Chip>;
  if (check.state === "ready")
    return <Chip tone="green" icon="check">{t("checkReady", { council: check.council, serial: check.serial, year: check.year })}</Chip>;
  // parsed but the council isn't live for roster search yet
  return check.council ? (
    <Chip tone="brand" icon="check">{t("checkParsed", { council: check.council, serial: check.serial, year: check.year })}</Chip>
  ) : (
    <Chip tone="brand" icon="check">{t("checkParsedNoCouncil", { canonical: check.canonical })}</Chip>
  );
}

// The two submit buttons live in a child so they can read the form's pending state.
// WO-349: `.btn-primary` (indigo) → `.ec-btn ec-btn-ink` (tokened ink button, matches every other
// reskinned primary action, e.g. quiet-hours-form.tsx's SaveButton) — colour only, same behaviour.
// `ctaLabel` lets a caller override just the primary button's copy (e.g. onboarding's lead card
// wants "Assemble practice") without forking this shared form or changing Settings' own copy.
function Actions({ nameOnly, canPrimary, canName, onToggle, ctaLabel }: {
  nameOnly: boolean; canPrimary: boolean; canName: boolean; onToggle: (v: boolean) => void; ctaLabel?: string;
}) {
  const t = useTranslations("settings.advocates");
  const { pending } = useFormStatus();
  return nameOnly ? (
    <div className="space-y-2">
      <button type="submit" name="mode" value="name-only" disabled={pending || !canName} className="ec-btn ec-btn-ink press">
        {pending ? t("saving") : t("nameOnlyCta")}
      </button>
      <button type="button" onClick={() => onToggle(false)} className="block text-xs text-ec-bronze hover:underline">
        {t("nameOnlyBack")}
      </button>
    </div>
  ) : (
    <div className="space-y-2">
      <button type="submit" name="mode" value="fetch" disabled={pending || !canPrimary} className="ec-btn ec-btn-ink press">
        <Icon name={pending ? "refresh" : "sparkles"} className={`h-4 w-4 ${pending ? "animate-spin" : ""}`} /> {pending ? t("saving") : (ctaLabel ?? t("fetchCta"))}
      </button>
      <p className="text-xs text-ec-ink-3">
        {t("nameOnlyToggle")}{" "}
        <button type="button" onClick={() => onToggle(true)} className="text-ec-bronze hover:underline">{t("nameOnlyAction")}</button>
      </p>
    </div>
  );
}

// WO-61: a guided, live-validated advocate entry (supersedes the WO-42 three-field form). The
// primary path REQUIRES a parseable enrolment with year (the input that actually fetches cases —
// founder ruling 2026-07-06); a clearly-secondary "add by name only" path stays for cause-list
// alerts. Live inline validation removes the "submit → wait 60s → learn you needed the year" trap.
export function AdvocateForm({ ctaLabel }: { ctaLabel?: string } = {}) {
  const t = useTranslations("settings");
  const [state, action] = useFormState(addAdvocate, initial);

  const [name, setName] = useState("");
  const [raw, setRaw] = useState("");
  const [councilId, setCouncilId] = useState("");
  const [councilTouched, setCouncilTouched] = useState(false);
  const [nameOnly, setNameOnly] = useState(false);

  // Auto-infer the State Bar Council from the enrolment's state prefix ("G/…" → Gujarat) until the
  // user picks one explicitly — one less field to think about, never overriding a manual choice.
  const inferredCouncil = useMemo(() => {
    const p = parseBarNumber(raw);
    return p ? councilByStatePrefix(p.stateBar)?.id ?? null : null;
  }, [raw]);
  const effectiveCouncil = councilTouched ? councilId : inferredCouncil ?? "";

  // Reset the form once an add succeeds (controlled inputs don't clear on their own).
  useEffect(() => {
    if (state.ok) {
      setName(""); setRaw(""); setCouncilId(""); setCouncilTouched(false); setNameOnly(false);
    }
  }, [state]);

  const canPrimary = name.trim().length > 0 && canFetchRoster(raw);
  const canName = name.trim().length > 0;

  return (
    <form action={action} className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <input
          name="name" required value={name} onChange={(e) => setName(e.target.value)}
          placeholder={t("advocates.nameLabel")} className="input" aria-label={t("advocates.nameLabel")}
        />
        {!nameOnly && (
          <input
            name="bar_registration_number" value={raw} onChange={(e) => setRaw(e.target.value.toUpperCase())}
            placeholder={t("advocates.barPlaceholder")} className="input font-mono uppercase"
            aria-label={t("advocates.barLabel")} autoCapitalize="characters" autoComplete="off" spellCheck={false}
          />
        )}
      </div>

      {!nameOnly && (
        <>
          <EnrolmentChip raw={raw} councilId={effectiveCouncil} />
          <input type="hidden" name="state_bar_council" value={effectiveCouncil} />
          <div className="max-w-sm">
            <Combobox
              label={t("advocates.councilLabel")}
              placeholder={t("advocates.councilPlaceholder")}
              options={COUNCIL_OPTIONS}
              value={effectiveCouncil || null}
              onChange={(v) => { setCouncilTouched(true); setCouncilId(v ?? ""); }}
            />
          </div>
        </>
      )}

      {nameOnly && <Chip tone="brand" icon="bulb">{t("advocates.nameOnlyNote")}</Chip>}

      <Actions
        nameOnly={nameOnly}
        canPrimary={canPrimary}
        canName={canName}
        onToggle={(v) => setNameOnly(v)}
        ctaLabel={ctaLabel}
      />

      {state.message && (
        <p role="status" className={`rounded-xl px-3.5 py-2.5 text-sm ${state.ok ? "bg-ec-success-t text-ec-success" : "bg-ec-warn-t text-ec-warn"}`}>
          {state.message}
        </p>
      )}
    </form>
  );
}
