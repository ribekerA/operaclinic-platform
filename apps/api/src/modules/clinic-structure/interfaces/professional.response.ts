import type { ProfessionalLinkedUserSummary } from "@operaclinic/shared";
import { SpecialtyResponse } from "./specialty.response";
import { UnitResponse } from "./unit.response";

export interface ProfessionalResponse {
  id: string;
  tenantId: string;
  fullName: string;
  displayName: string;
  professionalRegister: string;
  visibleForSelfBooking: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  linkedUser: ProfessionalLinkedUserSummary | null;
  specialties: Pick<SpecialtyResponse, "id" | "name" | "isActive">[];
  units: Pick<UnitResponse, "id" | "name" | "isActive">[];
}
