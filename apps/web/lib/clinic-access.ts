import { resolveAestheticClinicActor } from "@/lib/clinic-actor";

const CLINIC_DASHBOARD_ROLES = ["TENANT_ADMIN", "CLINIC_MANAGER"] as const;
const CLINIC_OPERATION_ROLES = [
  "TENANT_ADMIN",
  "CLINIC_MANAGER",
  "RECEPTION",
] as const;
const CLINIC_ALL_ROLES = [
  "TENANT_ADMIN",
  "CLINIC_MANAGER",
  "RECEPTION",
  "PROFESSIONAL",
] as const;

const clinicRouteAccess = [
  {
    pathPrefix: "/clinic/reception",
    allowedRoles: CLINIC_OPERATION_ROLES,
  },
  {
    pathPrefix: "/clinic/patients",
    allowedRoles: CLINIC_OPERATION_ROLES,
  },
  {
    pathPrefix: "/clinic/messaging",
    allowedRoles: CLINIC_OPERATION_ROLES,
  },
  {
    pathPrefix: "/clinic/inbox",
    allowedRoles: CLINIC_OPERATION_ROLES,
  },
  {
    pathPrefix: "/clinic/units",
    allowedRoles: CLINIC_OPERATION_ROLES,
  },
  {
    pathPrefix: "/clinic/specialties",
    allowedRoles: CLINIC_OPERATION_ROLES,
  },
  {
    pathPrefix: "/clinic/professionals",
    allowedRoles: CLINIC_OPERATION_ROLES,
  },
  {
    pathPrefix: "/clinic/consultation-types",
    allowedRoles: CLINIC_OPERATION_ROLES,
  },
  {
    pathPrefix: "/clinic/users",
    allowedRoles: ["TENANT_ADMIN"] as const,
  },
  {
    pathPrefix: "/clinic/account",
    allowedRoles: CLINIC_ALL_ROLES,
  },
  {
    pathPrefix: "/clinic/no-access",
    allowedRoles: CLINIC_ALL_ROLES,
  },
  {
    pathPrefix: "/clinic/professional",
    allowedRoles: ["PROFESSIONAL"] as const,
  },
  {
    pathPrefix: "/clinic",
    allowedRoles: CLINIC_DASHBOARD_ROLES,
  },
] as const;

function hasAnyRole(userRoles: string[], allowedRoles: readonly string[]): boolean {
  return allowedRoles.some((role) => userRoles.includes(role));
}

export function resolveClinicHomePath(userRoles: string[]): string {
  switch (resolveAestheticClinicActor(userRoles)) {
    case "admin":
    case "manager":
      return "/clinic";
    case "reception":
      return "/clinic/reception";
    case "professional":
      return "/clinic/professional";
    default:
      return "/clinic/no-access";
  }
}

export function canAccessClinicPath(pathname: string, userRoles: string[]): boolean {
  const matchedRule = clinicRouteAccess
    .slice()
    .sort((left, right) => right.pathPrefix.length - left.pathPrefix.length)
    .find((rule) => pathname === rule.pathPrefix || pathname.startsWith(`${rule.pathPrefix}/`));

  if (!matchedRule) {
    return true;
  }

  return hasAnyRole(userRoles, matchedRule.allowedRoles);
}
