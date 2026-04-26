"use client";

import type { ComponentType } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ActivitySquare,
  BarChart3,
  Bot,
  Blocks,
  BriefcaseMedical,
  Building2,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  Crown,
  CreditCard,
  FolderKanban,
  LayoutDashboard,
  LineChart,
  Radar,
  MessageSquareMore,
  Search,
  ShieldCheck,
  ShieldAlert,
  Stethoscope,
  TrendingUp,
  UserCog,
  Users,
  Wallet,
  Waypoints,
} from "lucide-react";
import { BrandMark } from "@/components/brand/brand-mark";
import { useProfileNavigation } from "@/hooks/use-profile-navigation";
import { resolveAestheticClinicActor } from "@/lib/clinic-actor";
import { UserProfile } from "@/lib/navigation";

interface AppSidebarProps {
  profile: UserProfile;
  roles: string[];
  mobile?: boolean;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  onNavigate?: () => void;
}

const sidebarCopy: Record<UserProfile, { title: string; label: string }> = {
  platform: {
    title: "Control plane",
    label: "Plataforma",
  },
  clinic: {
    title: "Clinica",
    label: "Clinica",
  },
};

const clinicActorTitle = {
  admin: "Admin",
  manager: "Gestao",
  reception: "Recepcao",
  professional: "Profissional",
  unknown: "Clinica",
} as const;

const navigationIcons: Record<string, ComponentType<{ className?: string }>> = {
  "/platform": LayoutDashboard,
  "/platform/operations": ActivitySquare,
  "/platform/growth": TrendingUp,
  "/platform/seo": Search,
  "/platform/market-intelligence": Radar,
  "/platform/finance": LineChart,
  "/platform/tenants": Building2,
  "/platform/agents": Bot,
  "/platform/reliability": ShieldAlert,
  "/platform/product-control": FolderKanban,
  "/platform/ceo-mode": Crown,
  "/platform/payments": Wallet,
  "/platform/plans": CreditCard,
  "/platform/users": ShieldCheck,
  "/clinic": ActivitySquare,
  "/clinic/reception": CalendarRange,
  "/clinic/inbox": MessageSquareMore,
  "/clinic/messaging": Waypoints,
  "/clinic/patients": Users,
  "/clinic/users": UserCog,
  "/clinic/account": ShieldCheck,
  "/clinic/professionals": Stethoscope,
  "/clinic/units": Building2,
  "/clinic/specialties": BriefcaseMedical,
  "/clinic/consultation-types": Blocks,
  "/clinic/professional": Stethoscope,
};

export function AppSidebar({
  profile,
  roles,
  mobile = false,
  collapsed = false,
  onToggleCollapse,
  onNavigate,
}: AppSidebarProps) {
  const pathname = usePathname();
  const items = useProfileNavigation(profile, roles);
  const clinicTitle =
    profile === "clinic" ? clinicActorTitle[resolveAestheticClinicActor(roles)] : null;
  const shellTitle = clinicTitle ?? sidebarCopy[profile].title;
  const shellLabel = profile === "platform" ? sidebarCopy[profile].label : "Workspace";
  const isCompact = !mobile && collapsed;

  const content = (
    <div className="space-y-3">
      <div
        className={`rounded-[22px] border border-slate-200 bg-white/90 shadow-sm ${
          isCompact ? "p-2.5" : "p-3"
        }`}
      >
        <div
          className={`flex ${
            isCompact ? "flex-col items-center gap-2" : "items-center justify-between gap-3"
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-100">
              <BrandMark className="w-8" priority />
            </div>
            {!isCompact ? (
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
                  {shellLabel}
                </p>
                <p className="truncate text-sm font-semibold text-ink">{shellTitle}</p>
              </div>
            ) : null}
          </div>

          {!mobile && onToggleCollapse ? (
            <button
              type="button"
              onClick={onToggleCollapse}
              className="inline-flex h-9 w-9 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-600 transition hover:bg-slate-100"
              aria-label={collapsed ? "Expandir navegacao" : "Recolher navegacao"}
              title={collapsed ? "Expandir navegacao" : "Recolher navegacao"}
            >
              {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            </button>
          ) : null}
        </div>
      </div>

      <nav className="space-y-2">
        {items.map((item) => {
          const isRootItem = item.href === "/platform" || item.href === "/clinic";
          const isActive =
            pathname === item.href ||
            (!isRootItem && pathname.startsWith(`${item.href}/`));
          const Icon = navigationIcons[item.href] ?? LayoutDashboard;

          return (
            <Link
              key={item.label}
              href={item.href}
              onClick={onNavigate}
              className={`group relative flex rounded-[20px] border transition ${
                isActive
                  ? "border-teal-200 bg-teal-50 text-slate-950 shadow-sm"
                  : "border-transparent bg-white/70 text-ink hover:border-slate-200 hover:bg-white"
              } ${isCompact ? "h-12 items-center justify-center px-2" : "items-center gap-3 px-3 py-2.5"}`}
              aria-label={isCompact ? item.label : undefined}
              title={isCompact ? item.label : undefined}
            >
              <span
                className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl ${
                  isActive
                    ? "bg-white text-teal-700"
                    : "bg-slate-100 text-slate-600 group-hover:bg-slate-200"
                }`}
              >
                <Icon className="h-5 w-5" />
              </span>
              {!isCompact ? (
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">{item.label}</span>
              ) : (
                <span className="pointer-events-none absolute left-full top-1/2 z-20 ml-3 -translate-y-1/2 whitespace-nowrap rounded-xl border border-slate-200 bg-slate-950 px-3 py-2 text-xs font-semibold text-white opacity-0 shadow-lg transition group-hover:opacity-100">
                  {item.label}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
    </div>
  );

  if (mobile) {
    return <div className="w-full min-w-[280px]">{content}</div>;
  }

  return (
    <aside
      className={`hidden shrink-0 border-r border-white/70 bg-white/50 backdrop-blur transition-[width,padding] duration-200 xl:block ${
        collapsed ? "w-[78px] p-2.5" : "w-56 p-3"
      }`}
    >
      <div className="sticky top-4 max-h-[calc(100vh-2rem)] overflow-y-auto">{content}</div>
    </aside>
  );
}
