export interface ClinicProfileResponse {
  id: string;
  tenantId: string;
  displayName: string;
  legalName: string | null;
  documentNumber: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  timezone: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

