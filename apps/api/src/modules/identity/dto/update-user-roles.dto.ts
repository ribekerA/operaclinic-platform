import { RoleCode } from "@prisma/client";

export class UpdateUserRolesDto {
  tenantId?: string;
  roleCodes!: RoleCode[];
}
