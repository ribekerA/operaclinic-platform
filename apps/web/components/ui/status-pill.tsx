interface StatusPillProps {
  label: string;
  tone?: "success" | "warning" | "danger" | "neutral";
}

const toneClasses: Record<NonNullable<StatusPillProps["tone"]>, string> = {
  success: "bg-success-soft text-success border-success/20",
  warning: "bg-warning-soft text-warning border-warning/20",
  danger: "bg-danger-soft text-danger border-danger/20",
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

