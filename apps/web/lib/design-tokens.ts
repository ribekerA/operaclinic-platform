/**
 * Espelha os tokens definidos em tailwind.config.ts para uso em lógica TS
 * (fora de className), evitando valores mágicos duplicados no código.
 * Qualquer novo token de cor/radius/z-index deve ser adicionado aqui E
 * em tailwind.config.ts — nunca apenas em um dos dois lugares.
 */

export const colorTokens = {
  canvas: "#f3f5f9",
  panel: "#ffffff",
  border: "#d5dce8",
  ink: "#1e293b",
  muted: "#64748b",
  accent: "#0f766e",
  accentSoft: "#ccfbf1",
  navy: "#0b1324",
  navySoft: "#111c34",
  success: "#0f9d63",
  successSoft: "#d8f5e6",
  warning: "#b45309",
  warningSoft: "#fef3c7",
  danger: "#be123c",
  dangerSoft: "#ffe4e6",
} as const;

export const radiusTokens = {
  card: "28px",
  panel: "20px",
  control: "14px",
  pill: "9999px",
} as const;

export const zIndexTokens = {
  dropdown: 40,
  sticky: 50,
  drawer: 60,
  modal: 70,
  toast: 80,
  tooltip: 90,
} as const;

export type StatusTone = "success" | "warning" | "danger" | "neutral";

/** Mapeia um StatusTone para classes Tailwind consistentes com os tokens acima. */
export const statusToneClassName: Record<StatusTone, string> = {
  success: "border-success/20 bg-success-soft text-success",
  warning: "border-warning/20 bg-warning-soft text-warning",
  danger: "border-danger/20 bg-danger-soft text-danger",
  neutral: "border-slate-200 bg-slate-100 text-slate-600",
};
