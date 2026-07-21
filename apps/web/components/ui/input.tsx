import { Search } from "lucide-react";
import { forwardRef, type InputHTMLAttributes } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

const baseClassName =
  "h-11 w-full rounded-control border bg-white px-3.5 text-sm text-ink placeholder:text-muted transition focus:outline-none focus-visible:ring-4 focus-visible:ring-teal-100 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-muted";

const toneClassName = (invalid?: boolean) =>
  invalid
    ? "border-danger focus-visible:ring-rose-100"
    : "border-slate-200 focus-visible:border-accent";

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ invalid, className = "", ...props }, ref) => (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      className={`${baseClassName} ${toneClassName(invalid)} ${className}`}
      {...props}
    />
  ),
);
Input.displayName = "Input";

interface SearchInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  onSearchChange?: (value: string) => void;
}

export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(
  ({ className = "", onChange, onSearchChange, placeholder = "Buscar...", ...props }, ref) => (
    <div className="relative">
      <Search
        className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
        aria-hidden="true"
      />
      <input
        ref={ref}
        type="search"
        placeholder={placeholder}
        onChange={(event) => {
          onChange?.(event);
          onSearchChange?.(event.target.value);
        }}
        className={`${baseClassName} ${toneClassName(false)} pl-10 ${className}`}
        {...props}
      />
    </div>
  ),
);
SearchInput.displayName = "SearchInput";
