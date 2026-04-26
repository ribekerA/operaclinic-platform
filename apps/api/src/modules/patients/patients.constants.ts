import { RoleCode } from "@prisma/client";

export const PATIENTS_READ_ROLES: readonly RoleCode[] = [
  RoleCode.TENANT_ADMIN,
  RoleCode.CLINIC_MANAGER,
  RoleCode.RECEPTION,
];

export const PATIENTS_WRITE_ROLES: readonly RoleCode[] = PATIENTS_READ_ROLES;
