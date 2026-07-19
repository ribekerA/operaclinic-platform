interface ProgressBarProps {
  value: number;
  max: number;
  tone?: "default" | "warning" | "danger";
  className?: string;
}

const trackToneClasses: Record<NonNullable<ProgressBarProps["tone"]>, string> = {
  default: "bg-teal-500",
  warning: "bg-amber-500",
  danger: "bg-rose-500",
};

export function ProgressBar({ value, max, tone = "default", className = "" }: ProgressBarProps) {
  const ratio = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;

  return (
    <div
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
      className={`h-2 w-full overflow-hidden rounded-full bg-slate-100 ${className}`}
    >
      <div
        className={`h-full rounded-full transition-all ${trackToneClasses[tone]}`}
        style={{ width: `${ratio * 100}%` }}
      />
    </div>
  );
}
