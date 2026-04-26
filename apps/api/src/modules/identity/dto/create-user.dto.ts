import { RoleCode, UserStatus } from "@prisma/client";

export class CreateUserDto {
  email!: string;
  fullName!: string;
  password!: string;
  tenantId?: string;
  status?: UserStatus;
  roleCodes!: RoleCode[];
  linkedProfessionalId?: string | null;
}
