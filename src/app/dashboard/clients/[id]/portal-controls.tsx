"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { inviteToPortal, revokePortal, sendFirmMessage } from "./actions";
import { Icon } from "@/components/icons";

export function PortalInvite({ clientId, portalUserId }: { clientId: string; portalUserId: string | null }) {
  const t = useTranslations("clients");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState("");
  const ref = useRef<HTMLFormElement>(null);
  const router = useRouter();

  if (portalUserId) {
    return (
      <div className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-sm text-emerald-700"><Icon name="check" className="h-4 w-4" /> {t("portalControls.accessActive")}</p>
        <button
          onClick={() => start(async () => { const r = await revokePortal(portalUserId, clientId); setMsg(r.message); router.refresh(); })}
          disabled={pending} className="btn-ghost text-sm text-red-600">{pending ? "…" : t("portalControls.revoke")}</button>
      </div>
    );
  }
  return (
    <form ref={ref} onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); start(async () => { const r = await inviteToPortal(clientId, fd); setMsg(r.message); if (r.ok) { ref.current?.reset(); router.refresh(); } }); }} className="space-y-2">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[12rem] flex-1"><label className="label">{t("portalControls.clientEmail")}</label><input name="email" type="email" required className="input mt-1" placeholder={t("portalControls.emailPlaceholder")} /></div>
        <div><label className="label">{t("portalControls.setPassword")}</label><input name="password" type="text" required minLength={8} className="input mt-1" placeholder={t("portalControls.passwordPlaceholder")} /></div>
        <button disabled={pending} className="btn-primary">{pending ? t("portalControls.creating") : t("portalControls.grantAccess")}</button>
      </div>
      {msg && <p className="text-xs text-ink-muted">{msg}</p>}
    </form>
  );
}

export function FirmComposer({ clientId }: { clientId: string }) {
  const t = useTranslations("clients");
  const [pending, start] = useTransition();
  const ref = useRef<HTMLFormElement>(null);
  const router = useRouter();
  return (
    <form ref={ref} onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); start(async () => { await sendFirmMessage(clientId, fd); ref.current?.reset(); router.refresh(); }); }} className="flex items-center gap-2">
      <input name="body" required placeholder={t("portalControls.replyPlaceholder")} className="input flex-1" aria-label={t("portalControls.messageAriaLabel")} />
      <button disabled={pending} className="btn-primary shrink-0">{pending ? "…" : t("portalControls.send")}</button>
    </form>
  );
}
