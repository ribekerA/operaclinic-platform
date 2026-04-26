import { RoleCode, UserStatus } from "@prisma/client";

export interface UserSummaryResponse {
  id: string;
  email: string;
  fullName: string;
  status: UserStatus;
  createdAt: Date;
  updatedAt: Date;
  roleAssignments: Array<{
    roleCode: RoleCode;
    tenantId: string | null;
  }>;
  tenantIds: string[];
  linkedProfessional: {
    id: string;
    fullName: string;
    displayName: string;
    professionalRegister: string;
    isActive: boolean;
  } | null;
  requiresProfessionalLink: boolean;
}
