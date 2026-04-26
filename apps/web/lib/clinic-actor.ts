export type AestheticClinicActor =
  | "admin"
  | "manager"
  | "reception"
  | "professional"
  | "unknown";

export function resolveAestheticClinicActor(roles: string[]): AestheticClinicActor {
  if (roles.includes("TENANT_ADMIN")) {
    return "admin";
  }

  if (roles.includes("CLINIC_MANAGER")) {
    return "manager";
  }

  if (roles.includes("RECEPTION")) {
    return "reception";
  }

  if (roles.includes("PROFESSIONAL")) {
    return "professional";
  }

  return "unknown";
}
