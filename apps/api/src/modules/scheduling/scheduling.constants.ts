import { RoleCode } from "@prisma/client";

export const SCHEDULING_ADMIN_ROLES: readonly RoleCode[] = [
  RoleCode.TENANT_ADMIN,
  RoleCode.CLINIC_MANAGER,
];

export const SCHEDULING_OPERATION_ROLES: readonly RoleCode[] = [
  ...SCHEDULING_ADMIN_ROLES,
  RoleCode.RECEPTION,
];
