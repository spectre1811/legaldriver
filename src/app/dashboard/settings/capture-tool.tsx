"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { generateCaptureToken } from "./capture-actions";

// Builds the bookmarklet. The advocate (logged into eCourts, having solved the
// CAPTCHA as a human) clicks it on a case page; it POSTs the rendered text to our
// token-authed endpoint. We never touch the CAPTCHA.
function bookmarklet(token: string, baseUrl: string): string {
  const code = `(function(){var t='${token}',b='${baseUrl}';fetch(b+'/api/court/capture',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:t,url:location.href,text:document.body.innerText})}).then(function(r){return r.json()}).then(function(d){alert(d.ok?('LexDriver \\u2713 captured '+(d.cnr||'')+(d.nextHearingDate?(' \\u00b7 next '+d.nextHearingDate):'')):('LexDriver: '+(d.error||'failed')))}).catch(function(e){alert('LexDriver: '+e)})})();`;
  return "javascript:" + encodeURIComponent(code);
}

export function CaptureTool({ token, baseUrl }: { token: string | null; baseUrl: string }) {
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
        Get fresh case data without any scraping: <b>you</b> log into the official eCourts portal and solve the CAPTCHA,
        open a case, then click this button — we parse the page into the case. We never automate or bypass the CAPTCHA.
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
              title="Drag me to your bookmarks bar"
            >
              <Icon name="scale" className="h-4 w-4" /> Capture to LexDriver
            </a>
            <span className="text-xs text-ink-faint">← drag to your bookmarks bar</span>
            <button onClick={() => { navigator.clipboard?.writeText(href); setCopied(true); setTimeout(() => setCopied(false), 1500); }} className="text-xs text-brand-600 hover:text-brand-700">
              {copied ? "Copied" : "Copy link"}
            </button>
            <button onClick={regen} disabled={pending} className="text-xs text-ink-faint hover:text-ink">{pending ? "…" : "Regenerate"}</button>
          </div>
          <ol className="list-decimal space-y-1 pl-5 text-xs text-ink-faint">
            <li>Drag <b>Capture to LexDriver</b> to your browser&apos;s bookmarks bar (once).</li>
            <li>Open <span className="text-ink-soft">services.ecourts.gov.in</span>, search a case, solve the CAPTCHA, open the case-details page.</li>
            <li>Click the bookmark — the case (parties, next hearing, acts) is filed into LexDriver.</li>
          </ol>
        </>
      ) : (
        <button onClick={regen} disabled={pending} className="btn-primary px-3 py-1.5 text-sm">{pending ? "…" : "Set up the capture tool"}</button>
      )}
    </div>
  );
}
