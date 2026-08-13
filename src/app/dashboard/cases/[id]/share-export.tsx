"use client";

// WO-411 · F2 — "Share case file" (stateless signed link, see share-token.ts) and "Export as PDF"
// (real downloadable file, see case-file-pdf.ts / pdf.ts). Split out of case-actions.tsx (already
// large) since this is a genuinely new chunk of behaviour: a dialog + a fetch-and-download flow,
// not another small useTransition button.
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/icons";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/toast";
import { generateShareLink } from "../actions";

const rowClass = "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px] text-ec-ink-2 transition-colors hover:bg-ec-paper-3 hover:text-ec-ink disabled:cursor-default disabled:opacity-50 disabled:hover:bg-transparent";

export function ShareCaseButton({ matterId, onDone }: { matterId: string; onDone?: () => void }) {
  const t = useTranslations("caseActions.share");
  const tc = useTranslations("common.actions");
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [link, setLink] = useState<{ url: string; expiresAt: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const openDialog = () => {
    onDone?.();
    setOpen(true);
    setError(null);
    setLink(null);
    start(async () => {
      const r = await generateShareLink(matterId);
      if (r.ok && r.url && r.expiresAt) setLink({ url: r.url, expiresAt: r.expiresAt });
      else setError(r.message);
    });
  };

  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.url);
      setCopied(true);
      toast({ title: t("copied"), variant: "success" });
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      toast({ title: t("copyFailed"), variant: "error" });
    }
  };

  const expiresLabel = link
    ? new Date(link.expiresAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })
    : null;

  return (
    <>
      <button type="button" onClick={openDialog} className={rowClass}>
        <Icon name="external" className="h-3.5 w-3.5 shrink-0" /> {t("menuLabel")}
      </button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        variant="center"
        className="max-w-md"
        header={{ title: t("dialogTitle"), closeLabel: tc("close") }}
      >
        <div className="space-y-3 px-5 py-4">
          <p className="text-sm text-ec-ink-2">{t("permissions")}</p>
          {pending && <p className="text-sm text-ec-ink-3">{t("generating")}</p>}
          {error && !pending && <p className="text-sm text-ec-danger">{error}</p>}
          {link && !pending && (
            <>
              <div className="flex items-center gap-2 rounded-ec-s border border-ec-line bg-ec-paper-3 px-3 py-2">
                <input
                  readOnly
                  value={link.url}
                  onFocus={(e) => e.currentTarget.select()}
                  className="min-w-0 flex-1 truncate bg-transparent text-[12.5px] text-ec-ink-2 outline-none"
                  aria-label={t("dialogTitle")}
                />
                <button type="button" onClick={copy} className="shrink-0 rounded-ec-s border border-ec-line px-2.5 py-1.5 text-[12px] text-ec-ink-2 transition hover:border-ec-line-strong hover:bg-ec-band">
                  <Icon name={copied ? "check" : "copy"} className="mr-1 inline h-3 w-3" /> {copied ? t("copied") : t("copyLink")}
                </button>
              </div>
              <p className="text-[12.5px] text-ec-ink-3">{t("expires", { date: expiresLabel })}</p>
              <p className="text-[12.5px] text-ec-ink-3">{t("noRevoke")}</p>
            </>
          )}
        </div>
      </Dialog>
    </>
  );
}

export function ExportPdfButton({ matterId, onDone }: { matterId: string; onDone?: () => void }) {
  const t = useTranslations("caseActions.export");
  const toast = useToast();
  const [pending, setPending] = useState(false);

  const run = async () => {
    onDone?.();
    setPending(true);
    try {
      const res = await fetch(`/api/cases/${matterId}/export-pdf`);
      if (!res.ok) {
        toast({ title: t("failed"), variant: "error" });
        return;
      }
      const blob = await res.blob();
      const cd = res.headers.get("content-disposition") ?? "";
      const filename = /filename="?([^"]+)"?/.exec(cd)?.[1] ?? "case-file.pdf";
      // Toast as soon as we KNOW the export succeeded (real bytes, in hand) — not gated on the
      // download click below, which hands off to the browser's own (OS-level, JS can't observe
      // completion of) save UI and shouldn't hold up the confirmation.
      toast({ title: t("done"), variant: "success" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      toast({ title: t("failed"), variant: "error" });
    } finally {
      setPending(false);
    }
  };

  return (
    <button type="button" onClick={run} disabled={pending} className={rowClass}>
      <Icon name="download" className="h-3.5 w-3.5 shrink-0" /> {pending ? t("preparing") : t("menuLabel")}
    </button>
  );
}
