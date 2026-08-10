"use client";

// WO-332 · sticky scroll-spy section nav — sits just under the case masthead (itself below the
// shell's own sticky top bar), highlights the section currently in view, and jumps on click.
// `top-14` matches TopBar/MobileNav's own sticky height (both ~56px) so the two sticky bars never
// overlap or fight for the same 0px. Native anchor-scroll semantics (an id + scrollIntoView), not
// a router/URL-hash dance — this is in-page wayfinding on one long scroll, not a route.
import { useEffect, useRef, useState } from "react";

export type NavSection = { id: string; label: string };

export function CaseSectionNav({ sections }: { sections: NavSection[] }) {
  const [active, setActive] = useState(sections[0]?.id ?? "");
  const clickedRef = useRef<string | null>(null);

  useEffect(() => {
    const targets = sections
      .map((s) => document.getElementById(s.id))
      .filter((el): el is HTMLElement => !!el);
    if (!targets.length) return;

    const io = new IntersectionObserver(
      (entries) => {
        // A click already knows which section it's headed to — don't let the observer fight the
        // in-flight scroll and flicker the highlight onto whatever it's currently passing over.
        if (clickedRef.current) return;
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      // Trigger zone starts below the two stacked sticky bars (top bar + this nav, ~112px) and
      // stays thin — the section nearest the top of the real (unobscured) viewport wins.
      { rootMargin: "-112px 0px -70% 0px", threshold: 0 },
    );
    targets.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [sections]);

  const jump = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    setActive(id);
    clickedRef.current = id;
    const reduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
    window.setTimeout(() => { clickedRef.current = null; }, 800);
  };

  if (!sections.length) return null;
  return (
    <nav
      aria-label="Case sections"
      className="sticky top-14 z-20 -mx-5 mb-7 overflow-x-auto border-b border-ec-hair bg-ec-paper/95 px-5 backdrop-blur sm:-mx-8 sm:px-8"
    >
      <div className="flex min-w-max gap-6">
        {sections.map((s) => {
          const on = active === s.id;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => jump(s.id)}
              aria-current={on ? "true" : undefined}
              className={`ec-label shrink-0 border-b-2 py-3 transition-colors ${
                on ? "border-ec-honey text-ec-ink" : "border-transparent text-ec-ink-3 hover:text-ec-ink-2"
              }`}
            >
              {s.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
