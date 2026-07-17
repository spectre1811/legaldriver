"use client";

import { useState, useTransition } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { addClient, runConflictCheck, type IntakeResult } from "./actions";
import { type ConflictHit } from "@/lib/conflict";
import { Icon } from "@/components/icons";
import { Combobox } from "@/components/combobox";
import { Segmented } from "../cases/segmented";

const initial: IntakeResult = { ok: false, message: "" };

function Submit({ ack }: { ack: boolean }) {
  const t = useTranslations("clients");
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary">
      {pending ? t("intake.adding") : ack ? t("intake.confirmAndAdd") : t("intake.addClient")}
    </button>
  );
}

export function ClientIntake({ practiceAreas }: { practiceAreas: { id: string; name: string }[] }) {
  const t = useTranslations("clients");
  const [state, action] = useFormState(addClient, initial);
  const [name, setName] = useState("");
  const [live, setLive] = useState<ConflictHit[] | null>(null);
  const [checking, startCheck] = useTransition();
  const router = useRouter();

  const conflicts = state.conflicts ?? live ?? [];
  const showAck = (state.conflicts?.length ?? 0) > 0;

  if (state.ok) {
    // refresh list after a successful add
    router.refresh();
  }

  return (
    <form action={action} className="space-y-4">
      <ClientFields
        practiceAreas={practiceAreas}
        nameField={
          <input
            id="name" name="name" required value={name}
            onChange={(e) => { setName(e.target.value); setLive(null); }}
            onBlur={() => name.trim().length > 2 && startCheck(async () => setLive(await runConflictCheck(name)))}
            placeholder={t("intake.namePlaceholder")} className="input"
          />
        }
      />

      {(checking || conflicts.length > 0) && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="flex items-center gap-2 text-sm font-medium text-amber-800">
            <Icon name="alert" className="h-4 w-4" />
            {checking ? t("intake.checkingConflicts") : t("intake.possibleConflicts", { count: conflicts.length })}
          </p>
          {conflicts.length > 0 && (
            <ul className="mt-2 space-y-1 text-sm text-amber-800">
              {conflicts.map((c, i) => (
                <li key={i} className="flex items-center justify-between">
                  <span>{c.name} <span className="text-amber-600">· {c.where}</span></span>
                  <span className="text-xs">{t("intake.matchPercent", { percent: Math.round(c.score * 100) })}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {showAck && <input type="hidden" name="ack_conflicts" value="1" />}

      <div className="flex items-center gap-3">
        <Submit ack={showAck} />
        {state.message && !state.ok && !showAck && <span className="text-sm text-amber-700">{state.message}</span>}
        {state.ok && <span className="text-sm text-emerald-700">{state.message}</span>}
      </div>
    </form>
  );
}

export type ClientDefaults = {
  name?: string;
  type?: string;
  emails?: string[];
  phones?: string[];
  practiceAreaId?: string | null;
  address?: string;
  contactPerson?: string;
  notes?: string;
};

// A repeatable list of text inputs sharing one form field name (server reads getAll(name)).
function MultiField({ name, label, type, placeholder, initial }: { name: string; label: string; type?: string; placeholder?: string; initial?: string[] }) {
  const t = useTranslations("clients");
  const [values, setValues] = useState<string[]>(initial?.length ? initial : [""]);
  return (
    <div>
      <label className="label">{label}</label>
      <div className="mt-1.5 space-y-2">
        {values.map((v, i) => (
          <div key={i} className="flex gap-2">
            <input
              name={name} type={type} value={v} placeholder={placeholder} className="input"
              onChange={(e) => setValues((prev) => prev.map((x, j) => (j === i ? e.target.value : x)))}
            />
            {values.length > 1 && (
              <button type="button" aria-label={t("intake.remove")} className="btn-ghost px-2" onClick={() => setValues((prev) => prev.filter((_, j) => j !== i))}>
                <Icon name="close" className="h-4 w-4" />
              </button>
            )}
          </div>
        ))}
      </div>
      <button type="button" className="mt-1.5 inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:underline" onClick={() => setValues((prev) => [...prev, ""])}>
        <Icon name="plus" className="h-3.5 w-3.5" /> {t("intake.addAnother")}
      </button>
    </div>
  );
}

// Shared intake + edit field set. `nameField` is passed in so intake can wire live
// conflict-checking onto the name input while edit uses a plain one. Type (Segmented)
// and practice area (Combobox) are controlled DS primitives inside a server-action
// <form>, so each carries a hidden <input> mirror (LEARNINGS combobox trap).
export function ClientFields({ practiceAreas, nameField, defaults }: { practiceAreas: { id: string; name: string }[]; nameField: React.ReactNode; defaults?: ClientDefaults }) {
  const t = useTranslations("clients");
  const [type, setType] = useState(defaults?.type === "org" ? "org" : "individual");
  const [areaId, setAreaId] = useState<string | null>(defaults?.practiceAreaId ?? null);
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div>
        <label className="label" htmlFor="name">{t("intake.clientPartyName")}</label>
        <div className="mt-1.5">{nameField}</div>
      </div>
      <div>
        <label className="label">{t("intake.type")}</label>
        <input type="hidden" name="type" value={type} />
        <div className="mt-1.5">
          <Segmented
            label={t("intake.type")} value={type} onChange={setType}
            options={[{ value: "individual", label: t("intake.typeIndividual") }, { value: "org", label: t("intake.typeOrg") }]}
          />
        </div>
      </div>

      <MultiField name="email" label={t("intake.email")} type="email" placeholder={t("intake.emailPlaceholder")} initial={defaults?.emails} />
      <MultiField name="phone" label={t("intake.phone")} placeholder={t("intake.phonePlaceholder")} initial={defaults?.phones} />

      <div className="sm:col-span-2">
        <label className="label">{t("intake.practiceArea")}</label>
        <input type="hidden" name="practice_area_id" value={areaId ?? ""} />
        <div className="mt-1.5">
          <Combobox
            label={t("intake.practiceArea")} placeholder={t("intake.practiceAreaPlaceholder")}
            options={practiceAreas.map((p) => ({ value: p.id, label: p.name }))}
            value={areaId} onChange={setAreaId}
          />
        </div>
      </div>

      {type === "org" && (
        <div className="sm:col-span-2">
          <label className="label" htmlFor="contact_person">{t("intake.contactPerson")}</label>
          <input id="contact_person" name="contact_person" defaultValue={defaults?.contactPerson} className="input mt-1.5" placeholder={t("intake.contactPersonPlaceholder")} />
        </div>
      )}
      <div className="sm:col-span-2">
        <label className="label" htmlFor="address">{t("intake.address")}</label>
        <input id="address" name="address" defaultValue={defaults?.address} className="input mt-1.5" placeholder={t("intake.addressPlaceholder")} />
      </div>
      <div className="sm:col-span-2">
        <label className="label" htmlFor="notes">{t("intake.notes")}</label>
        <textarea id="notes" name="notes" defaultValue={defaults?.notes} rows={3} className="input mt-1.5" placeholder={t("intake.notesPlaceholder")} />
      </div>
    </div>
  );
}
