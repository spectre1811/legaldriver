import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Legacy names REPOINTED to Editorial Chambers tokens (WO-03). The core
        // screens moved to the `ec-*` scale; these legacy names are now used only
        // by the not-yet-hand-converted screens, so pointing them at tokens brings
        // the whole app onto the brand palette in one consistent step. Values live
        // in tokens.css.
        paper: "var(--paper)",
        surface: "var(--paper-2)",
        ink: {
          DEFAULT: "var(--ink)",
          soft: "var(--ink-2)",
          muted: "var(--ink-3)",
          faint: "var(--n400)",
        },
        line: "var(--hair)",
        // Indigo primary + warm brass accent (from tokens).
        brand: {
          50: "var(--indigo-tint)",
          100: "var(--indigo-tint)",
          200: "var(--indigo-tint)",
          500: "var(--indigo)",
          600: "var(--indigo)",
          700: "var(--indigo)",
          900: "var(--ink)",
        },
        brass: { 400: "var(--brass)", 500: "var(--brass)", 600: "var(--brass-deep)" },
        accent: "var(--indigo)",

        // ——— WO-03 "Editorial Chambers" token layer (single source = tokens.css) ———
        // The `ec-*` scale is what the hand-converted core screens use directly;
        // the legacy names above now also point at these same tokens.
        ec: {
          paper: "var(--paper)",
          "paper-2": "var(--paper-2)",
          "paper-3": "var(--paper-3)",
          ink: "var(--ink)",
          "ink-2": "var(--ink-2)",
          "ink-3": "var(--ink-3)",
          brass: "var(--brass)",
          "brass-deep": "var(--brass-deep)",
          "brass-tint": "var(--brass-tint)",
          indigo: "var(--indigo)",
          "indigo-tint": "var(--indigo-tint)",
          success: "var(--success)",
          "success-t": "var(--success-t)",
          warn: "var(--warn)",
          "warn-t": "var(--warn-t)",
          danger: "var(--danger)",
          "danger-t": "var(--danger-t)",
          hair: "var(--hair)",
          "hair-strong": "var(--hair-strong)",
          n900: "var(--n900)", n800: "var(--n800)", n700: "var(--n700)",
          n600: "var(--n600)", n500: "var(--n500)", n400: "var(--n400)",
          n300: "var(--n300)", n200: "var(--n200)", n100: "var(--n100)",
          n050: "var(--n050)",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        serif: ["var(--font-serif)", "Georgia", "serif"],
        // token type roles (chain incl. Noto Devanagari/Gujarati) — see tokens.css
        display: ["var(--f-display)"],
        ui: ["var(--f-ui)"],
      },
      borderRadius: { xl: "0.875rem", "2xl": "1.125rem", "ec-s": "var(--r-s)", "ec-m": "var(--r-m)" },
      boxShadow: {
        card: "0 1px 2px rgba(16,18,24,0.04), 0 1px 3px rgba(16,18,24,0.06)",
        lift: "0 4px 14px rgba(16,18,24,0.08)",
        focus: "0 0 0 3px rgba(74,79,214,0.18)",
        "ec-1": "var(--e1)",
        "ec-2": "var(--e2)",
      },
      keyframes: {
        "fade-in": { from: { opacity: "0", transform: "translateY(4px)" }, to: { opacity: "1", transform: "translateY(0)" } },
      },
      animation: { "fade-in": "fade-in 0.3s ease-out" },
    },
  },
  plugins: [],
};

export default config;
