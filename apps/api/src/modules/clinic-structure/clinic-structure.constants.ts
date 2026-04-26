import { RoleCode } from "@prisma/client";

export const CLINIC_STRUCTURE_ADMIN_ROLES: readonly RoleCode[] = [
  RoleCode.TENANT_ADMIN,
  RoleCode.CLINIC_MANAGER,
];

export const CLINIC_STRUCTURE_READ_ROLES: readonly RoleCode[] = [
  ...CLINIC_STRUCTURE_ADMIN_ROLES,
  RoleCode.RECEPTION,
];

