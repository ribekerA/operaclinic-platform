"use client";

import type { KeyboardEvent, ReactNode } from "react";

export interface TabItem {
  value: string;
  label: string;
  badge?: string | number;
}

interface TabsProps {
  items: TabItem[];
  value: string;
  onChange: (value: string) => void;
  /** Deve ser o mesmo id passado para os <TabPanel> correspondentes (use useId() no componente pai). */
  id: string;
  className?: string;
}

/** Tabs acessíveis com navegação por setas (roving tabindex) e painéis controlados externamente. */
export function Tabs({ items, value, onChange, id: baseId, className = "" }: TabsProps) {

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const currentIndex = items.findIndex((item) => item.value === value);
    if (currentIndex === -1) return;

    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();
      const delta = event.key === "ArrowRight" ? 1 : -1;
      const nextIndex = (currentIndex + delta + items.length) % items.length;
      onChange(items[nextIndex]!.value);
    }
  };

  return (
    <div
      role="tablist"
      aria-orientation="horizontal"
      onKeyDown={handleKeyDown}
      className={`inline-flex w-fit items-center gap-1 rounded-control border border-slate-200 bg-white p-1 ${className}`}
    >
      {items.map((item) => {
        const isSelected = item.value === value;
        return (
          <button
            key={item.value}
            id={`${baseId}-tab-${item.value}`}
            role="tab"
            type="button"
            aria-selected={isSelected}
            aria-controls={`${baseId}-panel-${item.value}`}
            tabIndex={isSelected ? 0 : -1}
            onClick={() => onChange(item.value)}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-sm font-semibold transition focus:outline-none focus-visible:ring-4 focus-visible:ring-teal-100 ${
              isSelected ? "bg-accent text-white shadow-sm" : "text-muted hover:bg-slate-100 hover:text-ink"
            }`}
          >
            {item.label}
            {item.badge !== undefined ? (
              <span
                className={`rounded-full px-1.5 py-0.5 text-[11px] font-bold ${
                  isSelected ? "bg-white/20 text-white" : "bg-slate-200 text-slate-600"
                }`}
              >
                {item.badge}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

interface TabPanelProps {
  value: string;
  activeValue: string;
  baseId: string;
  children: ReactNode;
}

/** Painel correspondente a um TabItem. `baseId` deve ser o mesmo useId compartilhado com <Tabs>. */
export function TabPanel({ value, activeValue, baseId, children }: TabPanelProps) {
  if (value !== activeValue) return null;

  return (
    <div id={`${baseId}-panel-${value}`} role="tabpanel" aria-labelledby={`${baseId}-tab-${value}`}>
      {children}
    </div>
  );
}
