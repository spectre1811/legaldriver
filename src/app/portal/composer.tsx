"use client";

import { useFormState, useFormStatus } from "react-dom";
import { useRef, useEffect } from "react";
import { useTranslations } from "next-intl";
import { sendClientMessage, type ActionResult } from "./actions";
import { Icon } from "@/components/icons";

const initial: ActionResult = { ok: false, message: "" };

function Submit() {
  const { pending } = useFormStatus();
  const t = useTranslations("portal");
  return (
    <button type="submit" disabled={pending} className="ec-btn ec-btn-ink shrink-0">
      <Icon name="inbox" className="h-4 w-4" /> {pending ? "…" : t("composer.send")}
    </button>
  );
}

export function Composer() {
  const t = useTranslations("portal");
  const [state, action] = useFormState(sendClientMessage, initial);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state.ok) ref.current?.reset(); }, [state]);
  return (
    <form ref={ref} action={action} className="flex items-center gap-2">
      <input name="body" required placeholder={t("composer.placeholder")} className="input flex-1" aria-label={t("composer.aria")} />
      <Submit />
    </form>
  );
}
