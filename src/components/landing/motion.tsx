"use client";

// WO-324 W2 — motion primitives ported from the founder-approved Daybreak reference
// (design-mockups/iteration3/console/motion.tsx), trimmed to what this landing page
// consumes: scroll reveals (pairs with the .mk-reveal CSS in globals.css), the
// coverage count-up, and the hero-search typewriter placeholder. Every effect
// respects prefers-reduced-motion.
import { useEffect, useRef, useState } from "react";

function reducedMotion() {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

/** Observes every `.mk-reveal` element on the page and reveals it once, on scroll
    into view. Mount exactly once per page. */
export function ScrollReveals() {
  useEffect(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>(".mk-reveal:not(.is-in)"));
    if (!els.length) return;
    if (typeof IntersectionObserver === "undefined") {
      els.forEach((el) => el.classList.add("is-in"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            (e.target as HTMLElement).classList.add("is-in");
            io.unobserve(e.target);
          }
        });
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.12 },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
  return null;
}

/** Counts a numeral up once it scrolls into view; jumps straight to the value
    under reduced-motion. */
export function CountUp({ value, duration = 1100, className }: { value: number; duration?: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [seen, setSeen] = useState(false);
  const [n, setN] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    if (typeof IntersectionObserver === "undefined") {
      setSeen(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setSeen(true);
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.15 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [seen]);

  useEffect(() => {
    if (!seen) return;
    if (reducedMotion()) {
      setN(value);
      return;
    }
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
  }, [seen, value, duration]);

  return (
    <span ref={ref} className={className}>
      {n}
    </span>
  );
}

/** Cycling typewriter text — holds on the first phrase (no cycling) once `active`
    goes false, or under reduced-motion. */
export function useTypewriter(phrases: readonly string[], active: boolean) {
  const [text, setText] = useState(phrases[0] ?? "");
  const [i, setI] = useState(0);
  const [phase, setPhase] = useState<"type" | "hold" | "erase">("hold");

  useEffect(() => {
    if (!active || reducedMotion()) return;
    const word = phrases[i] ?? "";
    let delay = 55;
    if (phase === "hold") delay = 1500;
    if (phase === "erase") delay = 26;

    const t = setTimeout(() => {
      if (phase === "type") {
        const next = word.slice(0, text.length + 1);
        setText(next);
        if (next === word) setPhase("hold");
      } else if (phase === "hold") {
        setPhase("erase");
      } else {
        const next = text.slice(0, -1);
        setText(next);
        if (!next) {
          setI((v) => (v + 1) % phrases.length);
          setPhase("type");
        }
      }
    }, delay);
    return () => clearTimeout(t);
  }, [text, phase, i, phrases, active]);

  useEffect(() => {
    if (!active) setPhase("hold");
  }, [active]);

  return text;
}
