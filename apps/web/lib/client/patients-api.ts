import { requestJson } from "@/lib/client/http";

export type PatientContactType = "PHONE" | "WHATSAPP";

export interface PatientContactInputPayload {
  type: PatientContactType;
  value: string;
  isPrimary?: boolean;
}

export interface PatientSummaryResponse {
  id: string;
  tenantId: string;
  fullName: string | null;
  birthDate: string | null;
  documentNumber: string | null;
  notes: string | null;
  isActive: boolean;
  mergedIntoPatientId: string | null;
  mergedAt: string | null;
  createdAt: string;
  updatedAt: string;
  contacts: Array<{
    id: string;
    type: PatientContactType;
    value: string;
    normalizedValue: string;
    isPrimary: boolean;
  }>;
  protocolInstances: Array<{
    id: string;
    procedureProtocolId: string;
    procedureProtocolName: string;
    consultationTypeId: string;
    consultationTypeName: string;
    status: string;
    sessionsPlanned: number;
    sessionsScheduled: number;
    sessionsCompleted: number;
    nextSessionDate: string | null;
    expectedCompletionAt: string | null;
    updatedAt: string;
  }>;
}

export interface ListPatientsQuery {
  search?: string;
  contactValue?: string;
  isActive?: "true" | "false";
  limit?: string;
}

export interface CreatePatientPayload {
  fullName?: string;
  birthDate?: string;
  documentNumber?: string;
  notes?: string;
  isActive?: boolean;
  contacts?: PatientContactInputPayload[];
}

export interface UpdatePatientPayload {
  fullName?: string;
  birthDate?: string;
  documentNumber?: string;
  notes?: string;
  isActive?: boolean;
  contacts?: PatientContactInputPayload[];
}

export interface FindOrMergePatientPayload extends CreatePatientPayload {
  contacts: PatientContactInputPayload[];
}

function buildQuery(query?: ListPatientsQuery): string {
  if (!query) {
    return "";
  }

  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) {
      continue;
    }

    if (typeof value === "string" && !value.trim()) {
      continue;
    }

    params.set(key, String(value));
  }

  const queryString = params.toString();
  return queryString ? `?${queryString}` : "";
}

export async function listPatients(
  query?: ListPatientsQuery,
): Promise<PatientSummaryResponse[]> {
  return requestJson<PatientSummaryResponse[]>(`/api/patients${buildQuery(query)}`);
}

export async function createPatient(
  payload: CreatePatientPayload,
): Promise<PatientSummaryResponse> {
  return requestJson<PatientSummaryResponse>("/api/patients", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updatePatient(
  patientId: string,
  payload: UpdatePatientPayload,
): Promise<PatientSummaryResponse> {
  return requestJson<PatientSummaryResponse>(`/api/patients/${patientId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function findOrMergePatient(
  payload: FindOrMergePatientPayload,
): Promise<PatientSummaryResponse> {
  return requestJson<PatientSummaryResponse>("/api/patients/find-or-merge", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
