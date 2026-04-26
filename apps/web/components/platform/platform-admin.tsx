import { ReactNode } from "react";

export type AdminMetricTone = "default" | "accent" | "warning" | "danger";

const fieldBaseClassName =
  "w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-ink shadow-sm outline-none transition placeholder:text-slate-400 focus:border-teal-500 focus:ring-4 focus:ring-teal-100";

export const adminInputClassName = `${fieldBaseClassName} h-11`;
export const adminSelectClassName = `${fieldBaseClassName} h-11 appearance-none`;
export const adminTextareaClassName = `${fieldBaseClassName} min-h-[112px] py-3`;
export const adminMutedPanelClassName =
  "rounded-[28px] border border-slate-200/80 bg-slate-50/80 p-4";

interface AdminMetricCardProps {
  label: string;
  value: string;
  helper?: string;
  tone?: AdminMetricTone;
}

const toneClasses: Record<AdminMetricTone, string> = {
  default: "border-slate-200 bg-white text-ink",
  accent: "border-teal-200 bg-teal-50 text-slate-950",
  warning: "border-amber-200 bg-amber-50 text-slate-950",
  danger: "border-rose-200 bg-rose-50 text-slate-950",
};

export function AdminMetricCard({
  label,
  value,
  helper,
  tone = "default",
}: AdminMetricCardProps) {
  return (
    <div className={`rounded-[24px] border p-4 shadow-sm ${toneClasses[tone]}`}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted">
        {label}
      </p>
      <p className="mt-3 text-3xl font-semibold text-current">{value}</p>
      {helper ? <p className="mt-2 text-sm leading-6 text-muted">{helper}</p> : null}
    </div>
  );
}

interface AdminMetricGridProps {
  items: AdminMetricCardProps[];
  isLoading?: boolean;
}

export function AdminMetricGrid({
  items,
  isLoading = false,
}: AdminMetricGridProps) {
  if (isLoading) {
    return <AdminMetricSkeletonGrid />;
  }

  if (items.length === 0) {
    return null;
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => (
        <AdminMetricCard key={item.label} {...item} />
      ))}
    </div>
  );
}

export function AdminMetricSkeletonGrid() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: 4 }, (_, index) => (
        <div
          key={index}
          className="animate-pulse rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm"
        >
          <div className="h-3 w-24 rounded-full bg-slate-200" />
          <div className="mt-4 h-9 w-20 rounded-full bg-slate-200" />
          <div className="mt-3 h-3 w-32 rounded-full bg-slate-100" />
        </div>
      ))}
    </div>
  );
}

interface AdminPageHeaderProps {
  eyebrow?: string;
  title: string;
  description: string;
  actions?: ReactNode;
  children?: ReactNode;
}

export function AdminPageHeader({
  eyebrow = "Super Admin",
  title,
  description,
  actions,
  children,
}: AdminPageHeaderProps) {
  return (
    <section className="relative overflow-hidden rounded-[32px] border border-white/70 bg-white/90 p-6 shadow-panel backdrop-blur sm:p-7">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(45,212,191,0.18),_transparent_38%),radial-gradient(circle_at_bottom_right,_rgba(14,165,233,0.16),_transparent_36%)]" />
      <div className="relative space-y-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-3xl space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-muted">
              {eyebrow}
            </p>
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-ink sm:text-[2rem]">
                {title}
              </h1>
              <p className="mt-3 text-sm leading-7 text-muted sm:text-[15px]">
                {description}
              </p>
            </div>
          </div>

          {actions ? <div className="flex flex-wrap gap-3">{actions}</div> : null}
        </div>

        {children}
      </div>
    </section>
  );
}

interface AdminSectionHeaderProps {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}

export function AdminSectionHeader({
  eyebrow,
  title,
  description,
  actions,
}: AdminSectionHeaderProps) {
  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
      <div className="space-y-2">
        {eyebrow ? (
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted">
            {eyebrow}
          </p>
        ) : null}
        <div>
          <h2 className="text-xl font-semibold text-ink">{title}</h2>
          {description ? (
            <p className="mt-2 text-sm leading-6 text-muted">{description}</p>
          ) : null}
        </div>
      </div>

      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

interface AdminEmptyStateProps {
  title: string;
  description: string;
  action?: ReactNode;
}

export function AdminEmptyState({
  title,
  description,
  action,
}: AdminEmptyStateProps) {
  return (
    <div className="rounded-[28px] border border-dashed border-slate-300 bg-slate-50/80 px-5 py-10 text-center">
      <p className="text-base font-semibold text-ink">{title}</p>
      <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-muted">
        {description}
      </p>
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  );
}

interface AdminFilterSummaryProps {
  items: string[];
  onClear?: () => void;
}

export function AdminFilterSummary({
  items,
  onClear,
}: AdminFilterSummaryProps) {
  if (items.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-3 rounded-[24px] border border-slate-200 bg-white/80 p-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
          Filtros ativos
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {items.map((item) => (
            <span
              key={item}
              className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700"
            >
              {item}
            </span>
          ))}
        </div>
      </div>

      {onClear ? (
        <button
          type="button"
          onClick={onClear}
          className="inline-flex h-10 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-ink transition hover:bg-slate-50"
        >
          Limpar filtros
        </button>
      ) : null}
    </div>
  );
}

interface AdminShortcutItem {
  label: string;
  description: string;
  href?: string;
  onClick?: () => void;
}

interface AdminShortcutPanelProps {
  title?: string;
  items: AdminShortcutItem[];
}

export function AdminShortcutPanel({
  title = "Atalhos operacionais",
  items,
}: AdminShortcutPanelProps) {
  if (items.length === 0) {
    return null;
  }

  return (
    <div className="rounded-[24px] border border-slate-200 bg-white/80 p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
        {title}
      </p>
      <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => {
          const className =
            "block rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-3 text-left text-ink transition hover:border-slate-300 hover:bg-white";

          if (item.href) {
            return (
              <a key={item.label} href={item.href} className={className}>
                <p className="text-sm font-semibold text-ink">{item.label}</p>
                <p className="mt-1 text-xs leading-5 text-muted">
                  {item.description}
                </p>
              </a>
            );
          }

          return (
            <button
              key={item.label}
              type="button"
              onClick={item.onClick}
              className={className}
            >
              <p className="text-sm font-semibold text-ink">{item.label}</p>
              <p className="mt-1 text-xs leading-5 text-muted">
                {item.description}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

interface AdminCountBadgeProps {
  value: number;
  loading?: boolean;
}

export function AdminCountBadge({
  value,
  loading = false,
}: AdminCountBadgeProps) {
  return (
    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
      {loading ? "Carregando..." : `${value} resultado(s)`}
    </span>
  );
}

interface AdminCollectionSkeletonProps {
  items?: number;
  columns?: 1 | 2;
}

export function AdminCollectionSkeleton({
  items = 3,
  columns = 1,
}: AdminCollectionSkeletonProps) {
  return (
    <div className={`grid gap-3 ${columns === 2 ? "md:grid-cols-2" : ""}`}>
      {Array.from({ length: items }, (_, index) => (
        <div
          key={index}
          className="animate-pulse rounded-[28px] border border-slate-200 bg-white p-4"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-2">
              <div className="h-5 w-40 rounded-full bg-slate-200" />
              <div className="h-4 w-28 rounded-full bg-slate-100" />
            </div>
            <div className="h-7 w-24 rounded-full bg-slate-100" />
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="h-16 rounded-[20px] bg-slate-100" />
            <div className="h-16 rounded-[20px] bg-slate-100" />
          </div>
        </div>
      ))}
    </div>
  );
}

interface AdminFormSkeletonProps {
  fields?: number;
}

export function AdminFormSkeleton({ fields = 4 }: AdminFormSkeletonProps) {
  return (
    <div className="space-y-3 animate-pulse">
      {Array.from({ length: fields }, (_, index) => (
        <div key={index} className="space-y-2">
          <div className="h-3 w-24 rounded-full bg-slate-200" />
          <div className="h-11 rounded-2xl bg-slate-100" />
        </div>
      ))}
      <div className="h-11 rounded-2xl bg-slate-200" />
    </div>
  );
}
