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
    setIsDesktopSidebarCollapsed(
      savedPreference === null ? true : savedPreference === "true",
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
        <div className="rounded-[24px] border border-white/80 bg-white/90 px-6 py-4 text-sm text-muted shadow-panel backdrop-blur">
          Carregando sessao...
        </div>
      </div>
    );
  }

  if (error && error !== "PROFILE_MISMATCH") {
    return (
      <div className="mx-auto flex min-h-screen w-full max-w-[1720px] items-center justify-center px-6">
        <div className="rounded-[24px] border border-red-200 bg-red-50 px-6 py-4 text-sm text-red-700 shadow-panel">
          {error}
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
          title={profile === "platform" ? "Navegacao da plataforma" : "Navegacao da clinica"}
          description="Acesse rapidamente os modulos sem perder o contexto atual."
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
