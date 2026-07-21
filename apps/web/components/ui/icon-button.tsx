import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

type IconButtonVariant = "default" | "ghost" | "danger";
type IconButtonSize = "sm" | "md";

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: ReactNode;
  label: string;
  variant?: IconButtonVariant;
  size?: IconButtonSize;
}

const variantClassName: Record<IconButtonVariant, string> = {
  default: "border border-slate-200 bg-white text-ink hover:bg-slate-50 focus-visible:ring-slate-300",
  ghost: "text-muted hover:bg-slate-100 hover:text-ink focus-visible:ring-slate-300",
  danger: "text-danger hover:bg-danger-soft focus-visible:ring-rose-200",
};

const sizeClassName: Record<IconButtonSize, string> = {
  sm: "h-8 w-8 rounded-lg",
  md: "h-10 w-10 rounded-xl",
};

/** Botão apenas-ícone. `label` é obrigatório e vira aria-label + tooltip nativo (title). */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ icon, label, variant = "default", size = "md", className = "", ...props }, ref) => (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      title={label}
      className={`inline-flex shrink-0 items-center justify-center transition focus:outline-none focus-visible:ring-4 disabled:cursor-not-allowed disabled:opacity-50 ${variantClassName[variant]} ${sizeClassName[size]} ${className}`}
      {...props}
    >
      {icon}
    </button>
  ),
);
IconButton.displayName = "IconButton";
