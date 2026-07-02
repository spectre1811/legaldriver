import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Warm-neutral "paper" surfaces + ink text for a premium, editorial legal feel.
        paper: "#FBFAF8",
        surface: "#FFFFFF",
        ink: {
          DEFAULT: "#15161A",
          soft: "#3A3D46",
          muted: "#6B6F7B",
          faint: "#9AA0AD",
        },
        line: "#E9E7E1",
        // Deep legal indigo primary + warm brass accent.
        brand: {
          50: "#EEF0FF",
          100: "#E0E3FF",
          200: "#C4CAFF",
          500: "#4A4FD6",
          600: "#3A3FC4",
          700: "#2E32A0",
          900: "#1B1E5C",
        },
        brass: { 400: "#C9A24B", 500: "#B8902F", 600: "#9A7720" },
        // Back-compat alias used by pages not yet migrated to the new system.
        accent: "#3A3FC4",

        // ——— WO-03 "Editorial Chambers" token layer ———
        // Single source = src/app/tokens.css. Legacy keys above are left
        // untouched so un-reskinned screens don't shift; reskinned screens
        // (Waves 2–3) consume these `ec-*` tokens. Repointing bare names →
        // tokens is a tracked follow-up once every screen is migrated.
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
