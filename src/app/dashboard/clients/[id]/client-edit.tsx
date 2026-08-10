"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { updateClient } from "../actions";
import { type IntakeResult } from "../actions";
import { ClientFields, type ClientDefaults } from "../client-intake";
import { Icon } from "@/components/icons";

const initial: IntakeResult = { ok: false, message: "" };

// WO-347 · killed the legacy `.btn-primary`/`.btn-ghost`/amber-leak classes here — the ec-*
// tokened equivalents (Save is Wave-1's real `.ec-btn-ink`, not the pre-Chambers `.btn-primary`
// class name; the error line is --warn, not raw amber).
function Save() {
  const t = useTranslations("clients");
  const { pending } = useFormStatus();
  return <button type="submit" disabled={pending} className="ec-btn ec-btn-ink">{pending ? t("edit.saving") : t("edit.save")}</button>;
}

export function ClientEdit({ id, practiceAreas, defaults }: { id: string; practiceAreas: { id: string; name: string }[]; defaults: ClientDefaults }) {
  const t = useTranslations("clients");
  const [open, setOpen] = useState(false);
  const [state, action] = useFormState(updateClient, initial);
  const router = useRouter();

  if (state.ok && open) {
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="ec-btn ec-btn-ghost inline-flex items-center gap-1.5">
        <Icon name="edit" className="h-4 w-4" /> {t("edit.editClient")}
      </button>
    );
  }

  // Full-width form: the parent header is flex-wrap, so a w-full child wraps to its own row.
  return (
    <form action={action} className="ec-card w-full space-y-4 p-5">
      <div className="flex items-center justify-between">
        <h3 className="display text-base text-ec-ink">{t("edit.heading")}</h3>
        <button type="button" aria-label={t("edit.cancel")} onClick={() => setOpen(false)} className="ec-btn ec-btn-ghost px-2"><Icon name="close" className="h-4 w-4" /></button>
      </div>
      <input type="hidden" name="id" value={id} />
      <ClientFields
        practiceAreas={practiceAreas}
        defaults={defaults}
        nameField={<input id="name" name="name" required defaultValue={defaults.name} className="input" />}
      />
      <div className="flex items-center gap-3">
        <Save />
        <button type="button" onClick={() => setOpen(false)} className="ec-btn ec-btn-ghost">{t("edit.cancel")}</button>
        {state.message && !state.ok && <span className="text-[13px] text-ec-warn">{state.message}</span>}
      </div>
    </form>
  );
}
