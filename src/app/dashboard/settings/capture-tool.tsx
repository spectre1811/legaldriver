"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/icons";
import { brand } from "@/lib/brand";
import { generateCaptureToken } from "./capture-actions";

// Builds the bookmarklet. The advocate (logged into eCourts, having solved the
// CAPTCHA as a human) clicks it on a case page; it POSTs the rendered text to our
// token-authed endpoint. We never touch the CAPTCHA.
function bookmarklet(token: string, baseUrl: string): string {
  const code = `(function(){var t='${token}',b='${baseUrl}';fetch(b+'/api/court/capture',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:t,url:location.href,text:document.body.innerText})}).then(function(r){return r.json()}).then(function(d){var m=d.ok?(d.kind==='causelist'?('${brand.name} \\u2713 cause list: '+d.captured+' listed, '+d.matched+' of your cases'+(d.updated?(' \\u00b7 '+d.updated+' dates updated'):'')):('${brand.name} \\u2713 captured '+(d.cnr||'case')+(d.nextHearingDate?(' \\u00b7 next '+d.nextHearingDate):''))):('${brand.name}: '+(d.error||'failed'));alert(m)}).catch(function(e){alert('${brand.name}: '+e)})})();`;
  return "javascript:" + encodeURIComponent(code);
}

export function CaptureTool({ token, baseUrl }: { token: string | null; baseUrl: string }) {
  const t = useTranslations("settings");
  const [pending, start] = useTransition();
  const [copied, setCopied] = useState(false);
  const linkRef = useRef<HTMLAnchorElement>(null);
  const router = useRouter();
  const href = token ? bookmarklet(token, baseUrl) : "";

  // Set the javascript: href via the DOM (React strips javascript: hrefs).
  useEffect(() => { if (linkRef.current && href) linkRef.current.setAttribute("href", href); }, [href]);

  const regen = () => start(async () => { await generateCaptureToken(); router.refresh(); });

  return (
    <div className="space-y-3 text-sm">
      <p className="text-ink-muted">
        {t.rich("capture.intro", { b: (c) => <b>{c}</b> })}
      </p>
      {token ? (
        <>
          <div className="flex flex-wrap items-center gap-3">
            {/* eslint-disable-next-line jsx-a11y/anchor-is-valid */}
            <a
              ref={linkRef}
              href="#"
              onClick={(e) => e.preventDefault()}
              draggable
              className="inline-flex cursor-grab items-center gap-1.5 rounded-lg border border-brand-200 bg-brand-50 px-3 py-1.5 font-medium text-brand-700"
              title={t("capture.dragTitle")}
            >
              <Icon name="scale" className="h-4 w-4" /> {t("capture.buttonLabel")}
            </a>
            <span className="text-xs text-ink-faint">{t("capture.dragHint")}</span>
            <button onClick={() => { navigator.clipboard?.writeText(href); setCopied(true); setTimeout(() => setCopied(false), 1500); }} className="text-xs text-brand-600 hover:text-brand-700">
              {copied ? t("capture.copied") : t("capture.copyLink")}
            </button>
            <button onClick={regen} disabled={pending} className="text-xs text-ink-faint hover:text-ink">{pending ? "…" : t("capture.regenerate")}</button>
          </div>
          <ol className="list-decimal space-y-1 pl-5 text-xs text-ink-faint">
            <li>{t.rich("capture.step1", { b: (c) => <b>{c}</b> })}</li>
            <li>{t.rich("capture.step2", { url: (c) => <span className="text-ink-soft">{c}</span>, b: (c) => <b>{c}</b>, i: (c) => <i>{c}</i> })}</li>
            <li>{t("capture.step3")}</li>
            <li className="text-amber-700">{t.rich("capture.step4", { b: (c) => <b>{c}</b> })}</li>
          </ol>
        </>
      ) : (
        <button onClick={regen} disabled={pending} className="btn-primary px-3 py-1.5 text-sm">{pending ? "…" : t("capture.setup")}</button>
      )}
    </div>
  );
}
