import { RoleCode, UserStatus } from "@prisma/client";
import type { AuthenticatedUser } from "../../src/auth/interfaces/authenticated-user.interface";

export function buildClinicActor(
  overrides: Partial<AuthenticatedUser> = {},
): AuthenticatedUser {
  return {
    id: "user-clinic-1",
    email: "clinic.admin@operaclinic.local",
    fullName: "Clinic Admin",
    status: UserStatus.ACTIVE,
    profile: "clinic",
    roles: [RoleCode.TENANT_ADMIN],
    tenantIds: ["tenant-1"],
    activeTenantId: "tenant-1",
    ...overrides,
  };
}

export function buildPlatformActor(
  overrides: Partial<AuthenticatedUser> = {},
): AuthenticatedUser {
  return {
    id: "user-platform-1",
    email: "platform.admin@operaclinic.local",
    fullName: "Platform Admin",
    status: UserStatus.ACTIVE,
    profile: "platform",
    roles: [RoleCode.SUPER_ADMIN],
    tenantIds: [],
    activeTenantId: null,
    ...overrides,
  };
}
