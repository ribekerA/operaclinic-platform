import { requestJson } from "@/lib/client/http";
import type { ProfessionalLinkedUserSummary } from "@operaclinic/shared";

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
  createdAt: string;
  updatedAt: string;
}

export interface UnitResponse {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SpecialtyResponse {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProfessionalResponse {
  id: string;
  tenantId: string;
  fullName: string;
  displayName: string;
  professionalRegister: string;
  visibleForSelfBooking: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  linkedUser: ProfessionalLinkedUserSummary | null;
  specialties: Array<{
    id: string;
    name: string;
    isActive: boolean;
  }>;
  units: Array<{
    id: string;
    name: string;
    isActive: boolean;
  }>;
}

export interface ConsultationTypeResponse {
  id: string;
  tenantId: string;
  name: string;
  durationMinutes: number;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  isFirstVisit: boolean;
  isReturnVisit: boolean;
  isOnline: boolean;
  isActive: boolean;
  aestheticArea?: string | null;
  invasivenessLevel?: string | null;
  recoveryDays?: number | null;
  recommendedFrequencyDays?: number | null;
  preparationNotes?: string | null;
  contraindications?: string | null;
  aftercareGuidance?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProcedureProtocolResponse {
  id: string;
  tenantId: string;
  consultationTypeId: string;
  consultationTypeName: string;
  name: string;
  description: string | null;
  totalSessions: number;
  intervalBetweenSessionsDays: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateClinicPayload {
  displayName?: string;
  legalName?: string;
  documentNumber?: string;
  contactEmail?: string;
  contactPhone?: string;
  timezone?: string;
  isActive?: boolean;
}

export interface CreateUnitPayload {
  name: string;
  description?: string;
  isActive?: boolean;
}

export interface UpdateUnitPayload {
  name?: string;
  description?: string;
  isActive?: boolean;
}

export interface CreateSpecialtyPayload {
  name: string;
  description?: string;
  isActive?: boolean;
}

export interface UpdateSpecialtyPayload {
  name?: string;
  description?: string;
  isActive?: boolean;
}

export interface CreateProfessionalPayload {
  fullName: string;
  displayName: string;
  professionalRegister: string;
  accessEmail: string;
  accessPassword: string;
  visibleForSelfBooking?: boolean;
  isActive?: boolean;
  specialtyIds?: string[];
  unitIds?: string[];
}

export interface UpdateProfessionalPayload {
  fullName?: string;
  displayName?: string;
  professionalRegister?: string;
  visibleForSelfBooking?: boolean;
  isActive?: boolean;
  specialtyIds?: string[];
  unitIds?: string[];
}

export interface CreateConsultationTypePayload {
  name: string;
  durationMinutes: number;
  bufferBeforeMinutes?: number;
  bufferAfterMinutes?: number;
  isFirstVisit?: boolean;
  isReturnVisit?: boolean;
  isOnline?: boolean;
  isActive?: boolean;
  aestheticArea?: string | null;
  invasivenessLevel?: string | null;
  recoveryDays?: number | null;
  recommendedFrequencyDays?: number | null;
  preparationNotes?: string | null;
  contraindications?: string | null;
  aftercareGuidance?: string | null;
}

export interface UpdateConsultationTypePayload {
  name?: string;
  durationMinutes?: number;
  bufferBeforeMinutes?: number;
  bufferAfterMinutes?: number;
  isFirstVisit?: boolean;
  isReturnVisit?: boolean;
  isOnline?: boolean;
  isActive?: boolean;
  aestheticArea?: string | null;
  invasivenessLevel?: string | null;
  recoveryDays?: number | null;
  recommendedFrequencyDays?: number | null;
  preparationNotes?: string | null;
  contraindications?: string | null;
  aftercareGuidance?: string | null;
}

export interface ListProcedureProtocolsQuery {
  consultationTypeId?: string;
  isActive?: boolean;
}

export interface CreateProcedureProtocolPayload {
  consultationTypeId: string;
  name: string;
  description?: string;
  totalSessions: number;
  intervalBetweenSessionsDays: number;
  isActive?: boolean;
}

export interface UpdateProcedureProtocolPayload {
  consultationTypeId?: string;
  name?: string;
  description?: string;
  totalSessions?: number;
  intervalBetweenSessionsDays?: number;
  isActive?: boolean;
}

function buildQueryString(
  query?: Record<string, string | number | boolean | null | undefined>,
): string {
  if (!query) {
    return "";
  }

  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) {
      continue;
    }

    params.set(key, String(value));
  }

  const serialized = params.toString();
  return serialized ? `?${serialized}` : "";
}

export async function getClinicProfile(): Promise<ClinicProfileResponse> {
  return requestJson<ClinicProfileResponse>("/api/clinic");
}

export async function updateClinicProfile(
  payload: UpdateClinicPayload,
): Promise<ClinicProfileResponse> {
  return requestJson<ClinicProfileResponse>("/api/clinic", {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function listUnits(): Promise<UnitResponse[]> {
  return requestJson<UnitResponse[]>("/api/units");
}

export async function createUnit(payload: CreateUnitPayload): Promise<UnitResponse> {
  return requestJson<UnitResponse>("/api/units", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateUnit(
  unitId: string,
  payload: UpdateUnitPayload,
): Promise<UnitResponse> {
  return requestJson<UnitResponse>(`/api/units/${unitId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function listSpecialties(): Promise<SpecialtyResponse[]> {
  return requestJson<SpecialtyResponse[]>("/api/specialties");
}

export async function createSpecialty(
  payload: CreateSpecialtyPayload,
): Promise<SpecialtyResponse> {
  return requestJson<SpecialtyResponse>("/api/specialties", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateSpecialty(
  specialtyId: string,
  payload: UpdateSpecialtyPayload,
): Promise<SpecialtyResponse> {
  return requestJson<SpecialtyResponse>(`/api/specialties/${specialtyId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function listProfessionals(): Promise<ProfessionalResponse[]> {
  return requestJson<ProfessionalResponse[]>("/api/professionals");
}

export async function createProfessional(
  payload: CreateProfessionalPayload,
): Promise<ProfessionalResponse> {
  return requestJson<ProfessionalResponse>("/api/professionals", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateProfessional(
  professionalId: string,
  payload: UpdateProfessionalPayload,
): Promise<ProfessionalResponse> {
  return requestJson<ProfessionalResponse>(`/api/professionals/${professionalId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function listConsultationTypes(): Promise<ConsultationTypeResponse[]> {
  return requestJson<ConsultationTypeResponse[]>("/api/consultation-types");
}

export async function createConsultationType(
  payload: CreateConsultationTypePayload,
): Promise<ConsultationTypeResponse> {
  return requestJson<ConsultationTypeResponse>("/api/consultation-types", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateConsultationType(
  consultationTypeId: string,
  payload: UpdateConsultationTypePayload,
): Promise<ConsultationTypeResponse> {
  return requestJson<ConsultationTypeResponse>(
    `/api/consultation-types/${consultationTypeId}`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
  );
}

export async function listProcedureProtocols(
  query?: ListProcedureProtocolsQuery,
): Promise<ProcedureProtocolResponse[]> {
  return requestJson<ProcedureProtocolResponse[]>(
    `/api/procedure-protocols${
      buildQueryString({
        consultationTypeId: query?.consultationTypeId,
        isActive: query?.isActive,
      })
    }`,
  );
}

export async function createProcedureProtocol(
  payload: CreateProcedureProtocolPayload,
): Promise<ProcedureProtocolResponse> {
  return requestJson<ProcedureProtocolResponse>("/api/procedure-protocols", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateProcedureProtocol(
  procedureProtocolId: string,
  payload: UpdateProcedureProtocolPayload,
): Promise<ProcedureProtocolResponse> {
  return requestJson<ProcedureProtocolResponse>(
    `/api/procedure-protocols/${procedureProtocolId}`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
  );
}
