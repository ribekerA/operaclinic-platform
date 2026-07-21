import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
    "./hooks/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        canvas: "#f3f5f9",
        panel: "#ffffff",
        border: "#d5dce8",
        ink: "#1e293b",
        muted: "#64748b",
        accent: "#0f766e",
        accentSoft: "#ccfbf1",
        // Azul-marinho muito escuro para áreas premium (dashboards, CTA final, superfícies dark).
        navy: {
          DEFAULT: "#0b1324",
          soft: "#111c34",
        },
        success: {
          DEFAULT: "#0f9d63",
          soft: "#d8f5e6",
        },
        warning: {
          DEFAULT: "#b45309",
          soft: "#fef3c7",
        },
        danger: {
          DEFAULT: "#be123c",
          soft: "#ffe4e6",
        },
      },
      borderRadius: {
        card: "28px",
        panel: "20px",
        control: "14px",
        pill: "9999px",
      },
      spacing: {
        18: "4.5rem",
      },
      boxShadow: {
        panel: "0 20px 50px -30px rgba(15, 23, 42, 0.55)",
        control: "0 1px 2px 0 rgba(15, 23, 42, 0.06)",
        popover: "0 12px 32px -12px rgba(15, 23, 42, 0.35)",
      },
      fontFamily: {
        sans: ["var(--font-manrope)", "Segoe UI Variable Text", "Trebuchet MS", "sans-serif"],
        mono: ["var(--font-mono)", "Consolas", "monospace"],
      },
      backgroundImage: {
        "mesh-warm":
          "radial-gradient(at 10% 15%, rgba(20, 184, 166, 0.24) 0px, transparent 50%), radial-gradient(at 88% 10%, rgba(14, 116, 144, 0.18) 0px, transparent 48%), radial-gradient(at 52% 92%, rgba(15, 23, 42, 0.1) 0px, transparent 52%)",
      },
      zIndex: {
        dropdown: "40",
        sticky: "50",
        drawer: "60",
        modal: "70",
        toast: "80",
        tooltip: "90",
      },
      transitionDuration: {
        DEFAULT: "160ms",
      },
    },
  },
  plugins: [],
};

export default config;
