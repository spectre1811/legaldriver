"use client";

// WO-330 · ported from the Chambers prototype's design-mockups/iteration3/console/motion.tsx
// (Reveal + CountUp only — the prototype's typewriter/ScrollReveals are landing-page-only,
// not used by a single-view console page).
//
// Adapted trigger: the prototype's originals gate on IntersectionObserver (scroll-into-view),
// which suits a long marketing scroll. Overview is a short, above-the-fold utility page — an
// IO gate left the right rail's real figures (inbox/practice/orders) stuck invisible-at-zero
// whenever the element never scrolled through the viewport (caught render-inspecting 390px:
// CountUp's displayed VALUE, not just its visibility, was gated on the same observer). Trigger
// on mount instead: same CSS/easing, no risk of real data silently staying at 0.
//
// CSS-driven fade (.mk-reveal/.is-in, globals.css) already sits behind the site-wide
// prefers-reduced-motion block; CountUp additionally short-circuits to the final value under
// reduced motion since it's a rAF loop, not CSS.
import { useEffect, useState, type ComponentPropsWithoutRef, type ElementType, type ReactNode } from "react";

function useMounted() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(raf);
  }, []);
  return mounted;
}

/** Gentle fade-up reveal on mount. `as` picks the wrapper tag (default div) so a section/aside
 *  keeps its landmark semantics; any other prop (aria-label, etc.) passes through. */
export function Reveal<T extends ElementType = "div">({
  children,
  delay = 0,
  className,
  as,
  ...rest
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
  as?: T;
} & Omit<ComponentPropsWithoutRef<T>, "children" | "className">) {
  const mounted = useMounted();
  const As = (as ?? "div") as ElementType;
  return (
    <As className={`mk-reveal ${mounted ? "is-in" : ""} ${className ?? ""}`} style={{ transitionDelay: `${delay}ms` }} {...rest}>
      {children}
    </As>
  );
}

function reducedMotion() {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

/** Counts a numeral up on mount; jumps straight to value under reduced motion (or if JS hasn't
 *  hydrated yet — the number is never wrong, only the count-up flourish is skipped). */
export function CountUp({ value, duration = 700, className }: { value: number; duration?: number; className?: string }) {
  const [n, setN] = useState(value);

  useEffect(() => {
    if (reducedMotion()) {
      setN(value);
      return;
    }
    setN(0);
    let raf = 0;
    const start = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setN(Math.round(value * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);

  return <span className={className}>{n.toLocaleString("en-IN")}</span>;
}
