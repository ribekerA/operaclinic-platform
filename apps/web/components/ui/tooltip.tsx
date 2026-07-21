"use client";

import {
  cloneElement,
  isValidElement,
  useId,
  useState,
  type FocusEvent,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
} from "react";

interface TooltipProps {
  content: string;
  children: ReactElement<Record<string, unknown>>;
  side?: "top" | "bottom";
}

/** Tooltip acessível: aparece em hover E em foco de teclado (não depende de mouse). */
export function Tooltip({ content, children, side = "top" }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const tooltipId = useId();

  if (!isValidElement(children)) return children as ReactNode as ReactElement;

  const trigger = cloneElement(children, {
    "aria-describedby": tooltipId,
    onMouseEnter: (event: MouseEvent) => {
      setVisible(true);
      (children.props as { onMouseEnter?: (e: MouseEvent) => void }).onMouseEnter?.(event);
    },
    onMouseLeave: (event: MouseEvent) => {
      setVisible(false);
      (children.props as { onMouseLeave?: (e: MouseEvent) => void }).onMouseLeave?.(event);
    },
    onFocus: (event: FocusEvent) => {
      setVisible(true);
      (children.props as { onFocus?: (e: FocusEvent) => void }).onFocus?.(event);
    },
    onBlur: (event: FocusEvent) => {
      setVisible(false);
      (children.props as { onBlur?: (e: FocusEvent) => void }).onBlur?.(event);
    },
  });

  return (
    <span className="relative inline-flex">
      {trigger}
      <span
        id={tooltipId}
        role="tooltip"
        className={`pointer-events-none absolute left-1/2 z-tooltip w-max max-w-[220px] -translate-x-1/2 rounded-lg bg-navy px-2.5 py-1.5 text-xs font-medium text-white shadow-popover transition-opacity ${
          side === "top" ? "bottom-full mb-2" : "top-full mt-2"
        } ${visible ? "opacity-100" : "opacity-0"}`}
      >
        {content}
      </span>
    </span>
  );
}
