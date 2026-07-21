import { ChevronDown } from "lucide-react";
import { forwardRef, type SelectHTMLAttributes } from "react";

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ invalid, className = "", children, ...props }, ref) => (
    <div className="relative">
      <select
        ref={ref}
        aria-invalid={invalid || undefined}
        className={`h-11 w-full appearance-none rounded-control border bg-white px-3.5 pr-9 text-sm text-ink transition focus:outline-none focus-visible:ring-4 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-muted ${
          invalid
            ? "border-danger focus-visible:ring-rose-100"
            : "border-slate-200 focus-visible:border-accent focus-visible:ring-teal-100"
        } ${className}`}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
        aria-hidden="true"
      />
    </div>
  ),
);
Select.displayName = "Select";
