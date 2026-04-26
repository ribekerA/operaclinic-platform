import type { AestheticClinicLoginTenantOption } from "@operaclinic/shared";
import { RoleCode, UserStatus } from "@prisma/client";

export type AuthProfile = "platform" | "clinic";

export interface AuthenticatedUser {
  id: string;
  email: string;
  fullName?: string;
  status?: UserStatus;
  profile: AuthProfile;
  roles: RoleCode[];
  tenantIds: string[];
  activeTenantId: string | null;
  availableClinics?: AestheticClinicLoginTenantOption[];
  activeClinic?: AestheticClinicLoginTenantOption | null;
  linkedProfessionalId?: string | null;
  sessionVersion?: number;
}
