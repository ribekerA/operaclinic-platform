import { forwardRef, type TextareaHTMLAttributes } from "react";

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ invalid, className = "", rows = 4, ...props }, ref) => (
    <textarea
      ref={ref}
      rows={rows}
      aria-invalid={invalid || undefined}
      className={`w-full rounded-control border bg-white px-3.5 py-3 text-sm text-ink placeholder:text-muted transition focus:outline-none focus-visible:ring-4 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-muted ${
        invalid
          ? "border-danger focus-visible:ring-rose-100"
          : "border-slate-200 focus-visible:border-accent focus-visible:ring-teal-100"
      } ${className}`}
      {...props}
    />
  ),
);
Textarea.displayName = "Textarea";
