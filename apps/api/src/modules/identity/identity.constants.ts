import { RoleCode } from "@prisma/client";

export const CLINIC_ROLE_CODES: readonly RoleCode[] = [
  RoleCode.TENANT_ADMIN,
  RoleCode.CLINIC_MANAGER,
  RoleCode.RECEPTION,
  RoleCode.PROFESSIONAL,
];
