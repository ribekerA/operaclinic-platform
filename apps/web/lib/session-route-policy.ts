import { canAccessClinicPath, resolveClinicHomePath } from "@/lib/clinic-access";
import { SessionProfile } from "@/lib/session/types";

export interface SessionRouteSnapshot {
  profile: SessionProfile;
  roles: string[];
}

export function resolveDashboardPath(session: SessionRouteSnapshot): string {
  if (session.profile === "platform") {
    return "/platform";
  }

  return resolveClinicHomePath(session.roles);
}

function resolveLoginPath(profile: SessionProfile): string {
  return profile === "platform" ? "/login/platform" : "/login/clinic";
}

export function resolveRouteRedirect(
  pathname: string,
  session: SessionRouteSnapshot | null,
): string | null {
  const isPlatformArea = pathname.startsWith("/platform");
  const isClinicArea = pathname.startsWith("/clinic");
  const isPlatformLogin = pathname === "/login/platform";
  const isClinicLogin = pathname === "/login/clinic";
  const isClinicRoot = pathname === "/clinic";

  if (isPlatformLogin) {
    if (session?.profile === "platform") {
      return "/platform";
    }

    return null;
  }

  if (isClinicLogin) {
    if (session?.profile === "clinic") {
      return resolveDashboardPath(session);
    }

    return null;
  }

  if (!isPlatformArea && !isClinicArea) {
    return null;
  }

  if (!session) {
    const fallbackProfile: SessionProfile = isPlatformArea ? "platform" : "clinic";
    return resolveLoginPath(fallbackProfile);
  }

  if (isPlatformArea && session.profile !== "platform") {
    return resolveDashboardPath(session);
  }

  if (isClinicArea && session.profile !== "clinic") {
    return resolveDashboardPath(session);
  }

  if (
    isClinicArea &&
    session.profile === "clinic" &&
    !canAccessClinicPath(pathname, session.roles)
  ) {
    return resolveDashboardPath(session);
  }

  if (isClinicRoot && session.profile === "clinic") {
    const dashboardPath = resolveDashboardPath(session);
    return dashboardPath === pathname ? null : dashboardPath;
  }

  return null;
}
