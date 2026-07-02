type ButtonVariant = "primary" | "secondary" | "accent" | "ghost" | "danger" | "warning";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: React.ReactNode;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-slate-950 text-white hover:bg-slate-800 focus:ring-slate-200",
  secondary:
    "border border-slate-200 bg-white text-ink hover:bg-slate-50 focus:ring-slate-200",
  accent:
    "bg-accent text-white shadow-sm hover:opacity-90 focus:ring-teal-100",
  ghost:
    "text-ink hover:bg-slate-100 focus:ring-slate-200",
  danger:
    "bg-rose-600 text-white hover:bg-rose-500 focus:ring-rose-100",
  warning:
    "bg-amber-600 text-white hover:bg-amber-500 focus:ring-amber-100",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "h-9 px-3 text-xs rounded-xl gap-1.5",
  md: "h-11 px-4 text-sm rounded-2xl gap-2",
  lg: "h-12 px-5 text-base rounded-2xl gap-2",
};

export function buttonVariants({
  variant = "accent",
  size = "md",
  className = "",
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
} = {}): string {
  return `inline-flex items-center justify-center font-semibold transition focus:outline-none focus:ring-4 disabled:cursor-not-allowed disabled:opacity-60 ${variantClasses[variant]} ${sizeClasses[size]} ${className}`.trim();
}

export function Button({
  variant = "accent",
  size = "md",
  children,
  className = "",
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      className={buttonVariants({ variant, size, className })}
    >
      {children}
    </button>
  );
}
