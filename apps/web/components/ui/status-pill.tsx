interface StatusPillProps {
  label: string;
  tone?: "success" | "warning" | "danger" | "neutral";
}

const toneClasses: Record<NonNullable<StatusPillProps["tone"]>, string> = {
  success: "bg-emerald-50 text-emerald-700 border-emerald-200",
  warning: "bg-amber-50 text-amber-700 border-amber-200",
  danger: "bg-rose-50 text-rose-700 border-rose-200",
  neutral: "bg-slate-100 text-slate-700 border-slate-200",
};

export function StatusPill({ label, tone = "neutral" }: StatusPillProps) {
  return (
    <span
      className={`inline-flex w-fit rounded-full border px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.08em] ${toneClasses[tone]}`}
    >
      {label}
    </span>
  );
}

