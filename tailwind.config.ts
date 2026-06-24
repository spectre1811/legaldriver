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
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        serif: ["var(--font-serif)", "Georgia", "serif"],
      },
      borderRadius: { xl: "0.875rem", "2xl": "1.125rem" },
      boxShadow: {
        card: "0 1px 2px rgba(16,18,24,0.04), 0 1px 3px rgba(16,18,24,0.06)",
        lift: "0 4px 14px rgba(16,18,24,0.08)",
        focus: "0 0 0 3px rgba(74,79,214,0.18)",
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
