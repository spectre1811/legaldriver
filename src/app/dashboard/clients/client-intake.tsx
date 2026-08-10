"use client";

// WO-333 · Chambers reskin — the shared field set behind the client-edit form.
// WO-347: the "+ Add client" flow moved to a 2-step wizard (add-client-modal.tsx, its own
// bespoke fields matching the prototype's Step 1/2 layout exactly) — this file now only keeps
// what client-edit.tsx (../[id]/client-edit.tsx) still shares: ClientFields (a single-screen
// field set for editing) and the repeatable-row MultiField it's built from.
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/icons";
import { Combobox } from "@/components/combobox";
import { Segmented } from "../cases/segmented";

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
      <label className="eyebrow">{label}</label>
      <div className="mt-1.5 space-y-2">
        {values.map((v, i) => (
          <div key={i} className="flex gap-2">
            <input
              name={name} type={type} value={v} placeholder={placeholder} className="input"
              onChange={(e) => setValues((prev) => prev.map((x, j) => (j === i ? e.target.value : x)))}
            />
            {values.length > 1 && (
              <button type="button" aria-label={t("intake.remove")} className="ec-btn ec-btn-ghost px-2" onClick={() => setValues((prev) => prev.filter((_, j) => j !== i))}>
                <Icon name="close" className="h-4 w-4" />
              </button>
            )}
          </div>
        ))}
      </div>
      <button type="button" className="mt-1.5 inline-flex items-center gap-1 text-sm font-medium text-ec-bronze hover:underline" onClick={() => setValues((prev) => [...prev, ""])}>
        <Icon name="plus" className="h-3.5 w-3.5" /> {t("intake.addAnother")}
      </button>
    </div>
  );
}

// Edit's field set. `nameField` is passed in so the caller wires its own name input (edit uses a
// plain one — the wizard's own live conflict-checking name input is bespoke, see
// add-client-modal.tsx). Type (Segmented) and practice area (Combobox) are controlled DS
// primitives inside a server-action <form>, so each carries a hidden <input> mirror (LEARNINGS
// combobox trap).
export function ClientFields({ practiceAreas, nameField, defaults }: { practiceAreas: { id: string; name: string }[]; nameField: React.ReactNode; defaults?: ClientDefaults }) {
  const t = useTranslations("clients");
  const [type, setType] = useState(defaults?.type === "org" ? "org" : "individual");
  const [areaId, setAreaId] = useState<string | null>(defaults?.practiceAreaId ?? null);
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div>
        <label className="eyebrow" htmlFor="name">{t("intake.clientPartyName")}</label>
        <div className="mt-1.5">{nameField}</div>
      </div>
      <div>
        <label className="eyebrow">{t("intake.type")}</label>
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
        <label className="eyebrow">{t("intake.practiceArea")}</label>
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
          <label className="eyebrow" htmlFor="contact_person">{t("intake.contactPerson")}</label>
          <input id="contact_person" name="contact_person" defaultValue={defaults?.contactPerson} className="input mt-1.5" placeholder={t("intake.contactPersonPlaceholder")} />
        </div>
      )}
      <div className="sm:col-span-2">
        <label className="eyebrow" htmlFor="address">{t("intake.address")}</label>
        <input id="address" name="address" defaultValue={defaults?.address} className="input mt-1.5" placeholder={t("intake.addressPlaceholder")} />
      </div>
      <div className="sm:col-span-2">
        <label className="eyebrow" htmlFor="notes">{t("intake.notes")}</label>
        <textarea id="notes" name="notes" defaultValue={defaults?.notes} rows={3} className="input mt-1.5" placeholder={t("intake.notesPlaceholder")} />
      </div>
    </div>
  );
}
