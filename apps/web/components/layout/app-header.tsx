import { Menu } from "lucide-react";
import { BrandMark } from "@/components/brand/brand-mark";
import { resolveAestheticClinicActor } from "@/lib/clinic-actor";
import { UserProfile } from "@/lib/navigation";
import { SessionUser } from "@/lib/session/types";
import { ClinicSwitcher } from "./clinic-switcher";
import { LogoutButton } from "./logout-button";

interface AppHeaderProps {
  profile: UserProfile;
  title: string;
  subtitle: string;
  user: SessionUser;
  onOpenSidebar?: () => void;
}

const profileLabel: Record<UserProfile, string> = {
  platform: "Plataforma",
  clinic: "Clinica",
};

const clinicActorLabel = {
  admin: "Admin",
  manager: "Gestao",
  reception: "Recepcao",
  professional: "Profissional",
  unknown: "Clinica",
} as const;

export function AppHeader({
  profile,
  title,
  subtitle: _subtitle,
  user,
  onOpenSidebar,
}: AppHeaderProps) {
  const roleLabel =
    profile === "clinic"
      ? clinicActorLabel[resolveAestheticClinicActor(user.roles)]
      : profileLabel[profile];
  const initials = (user.fullName ?? user.email).charAt(0).toUpperCase();

  return (
    <header className="sticky top-0 z-20 border-b border-white/70 bg-canvas/80 backdrop-blur-xl">
      <div className="px-3 py-2 sm:px-4 lg:px-5 xl:px-6">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={onOpenSidebar}
              className="inline-flex h-9 w-9 items-center justify-center rounded-2xl border border-slate-200 bg-white text-ink shadow-sm transition hover:bg-slate-50 xl:hidden"
              aria-label="Abrir navegacao"
            >
              <Menu className="h-5 w-5" />
            </button>

            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white shadow-sm xl:hidden">
              <BrandMark className="w-7" priority />
            </div>

            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex rounded-full bg-teal-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-teal-700">
                  {roleLabel}
                </span>
                <p className="truncate text-base font-semibold text-ink">{title}</p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
            {profile === "clinic" ? <ClinicSwitcher user={user} /> : null}

            <div className="flex items-center gap-2 rounded-[20px] border border-white/80 bg-white px-3 py-1.5 shadow-sm">
              <div
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-semibold text-white"
                title={user.fullName ? `${user.fullName} (${user.email})` : user.email}
              >
                {initials}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-ink">
                  {user.fullName ?? user.email}
                </p>
                <p className="hidden truncate text-xs text-muted xl:block">{user.email}</p>
              </div>
            </div>

            <LogoutButton profile={profile} />
          </div>
        </div>
      </div>
    </header>
  );
}
