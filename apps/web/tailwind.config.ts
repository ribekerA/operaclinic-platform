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
      },
      boxShadow: {
        panel: "0 20px 50px -30px rgba(15, 23, 42, 0.55)",
      },
      fontFamily: {
        sans: ["Manrope", "Segoe UI Variable Text", "Trebuchet MS", "sans-serif"],
        mono: ["IBM Plex Mono", "Consolas", "monospace"],
      },
      backgroundImage: {
        "mesh-warm":
          "radial-gradient(at 10% 15%, rgba(20, 184, 166, 0.24) 0px, transparent 50%), radial-gradient(at 88% 10%, rgba(14, 116, 144, 0.18) 0px, transparent 48%), radial-gradient(at 52% 92%, rgba(15, 23, 42, 0.1) 0px, transparent 52%)",
      },
    },
  },
  plugins: [],
};

export default config;
