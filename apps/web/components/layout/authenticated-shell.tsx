"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppHeader } from "@/components/layout/app-header";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { Sheet } from "@/components/ui/sheet";
import { useSession } from "@/hooks/use-session";
import { UserProfile } from "@/lib/navigation";

interface AuthenticatedShellProps {
  profile: UserProfile;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}

export function AuthenticatedShell({
  profile,
  title,
  subtitle,
  children,
}: AuthenticatedShellProps) {
  const router = useRouter();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isDesktopSidebarCollapsed, setIsDesktopSidebarCollapsed] = useState(false);
  const { user, loading, error } = useSession({
    expectedProfile: profile,
  });
  const sidebarPreferenceKey = `operaclinic:${profile}:sidebar-collapsed:v2`;

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const savedPreference = window.localStorage.getItem(sidebarPreferenceKey);
    // Novos usuários (sem preferência salva) veem a sidebar expandida
    setIsDesktopSidebarCollapsed(
      savedPreference === null ? false : savedPreference === "true",
    );
  }, [sidebarPreferenceKey]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(
      sidebarPreferenceKey,
      isDesktopSidebarCollapsed ? "true" : "false",
    );
  }, [isDesktopSidebarCollapsed, sidebarPreferenceKey]);

  useEffect(() => {
    if (loading) {
      return;
    }

    if (!user) {
      router.replace(profile === "platform" ? "/login/platform" : "/login/clinic");
      return;
    }

    if (user.profile !== profile) {
      router.replace(user.profile === "platform" ? "/platform" : "/clinic");
    }
  }, [loading, user, profile, router]);

  if (loading || !user) {
    return (
      <div className="mx-auto flex min-h-screen w-full max-w-[1720px] items-center justify-center px-6">
        <div className="flex items-center gap-3 rounded-[24px] border border-white/80 bg-white/90 px-6 py-4 text-sm text-muted shadow-panel backdrop-blur">
          <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" />
          Carregando sessão...
        </div>
      </div>
    );
  }

  if (error && error !== "PROFILE_MISMATCH") {
    return (
      <div className="mx-auto flex min-h-screen w-full max-w-[1720px] items-center justify-center px-6">
        <div className="space-y-4 rounded-[24px] border border-red-200 bg-red-50 px-6 py-5 text-sm text-red-700 shadow-panel">
          <p>{error}</p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex h-9 items-center gap-2 rounded-xl border border-red-200 bg-white px-3 text-xs font-semibold text-red-700 transition hover:bg-red-50"
            >
              Tentar novamente
            </button>
            <a
              href={profile === "platform" ? "/login/platform" : "/login/clinic"}
              className="inline-flex h-9 items-center gap-2 rounded-xl border border-red-200 bg-white px-3 text-xs font-semibold text-red-700 transition hover:bg-red-50"
            >
              Ir para o login
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <div className="mx-auto flex min-h-screen w-full max-w-[1720px]">
        <AppSidebar
          profile={profile}
          roles={user.roles}
          collapsed={isDesktopSidebarCollapsed}
          onToggleCollapse={() =>
            setIsDesktopSidebarCollapsed((current) => !current)
          }
        />

        <Sheet
          open={isSidebarOpen}
          onClose={() => setIsSidebarOpen(false)}
          title={profile === "platform" ? "Navegação da plataforma" : "Navegação da clínica"}
          description="Acesse rapidamente os módulos sem perder o contexto atual."
        >
          <AppSidebar
            profile={profile}
            roles={user.roles}
            mobile
            onNavigate={() => setIsSidebarOpen(false)}
          />
        </Sheet>

        <div className="flex min-h-screen min-w-0 flex-1 flex-col">
          <AppHeader
            profile={profile}
            title={title}
            subtitle={subtitle}
            user={user}
            onOpenSidebar={() => setIsSidebarOpen(true)}
          />
          <main className="flex-1 px-3 py-4 sm:px-4 lg:px-6 xl:px-8">{children}</main>
        </div>
      </div>
    </div>
  );
}
