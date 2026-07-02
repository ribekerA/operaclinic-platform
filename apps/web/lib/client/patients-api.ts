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
  allergies: string | null;
  aestheticGoals: string | null;
  contraindications: string | null;
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
  allergies?: string;
  aestheticGoals?: string;
  contraindications?: string;
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

// ─── Patient Protocol Instances ─────────────────────────────────────────────

export interface PatientProtocolSessionItem {
  id: string;
  sessionSequence: number;
  status: "PLANNED" | "SCHEDULED" | "COMPLETED" | "CANCELED" | "SKIPPED";
  plannedStartDate: string;
  appointment: { id: string; startsAt: string; status: string } | null;
}

export interface PatientProtocolInstanceResponse {
  id: string;
  patientId: string;
  procedureProtocolId: string;
  status: "ACTIVE" | "COMPLETED" | "ABANDONED" | "CANCELED";
  sessionsPlanned: number;
  sessionsScheduled: number;
  sessionsCompleted: number;
  startedAt: string;
  expectedCompletionAt: string | null;
  completedAt: string | null;
  notes: string | null;
  procedureProtocol: {
    id: string;
    name: string;
    totalSessions: number;
    intervalBetweenSessionsDays: number;
    consultationType?: { id: string; name: string };
  };
  sessionAppointments: PatientProtocolSessionItem[];
}

export async function listPatientProtocolInstances(
  patientId: string,
): Promise<PatientProtocolInstanceResponse[]> {
  return requestJson<PatientProtocolInstanceResponse[]>(
    `/api/procedure-protocols/instances/patient/${patientId}`,
  );
}

export async function enrollPatientInProtocol(input: {
  patientId: string;
  procedureProtocolId: string;
  notes?: string;
}): Promise<PatientProtocolInstanceResponse> {
  return requestJson<PatientProtocolInstanceResponse>(
    "/api/procedure-protocols/instances/enroll",
    { method: "POST", body: JSON.stringify(input) },
  );
}

export async function updateProtocolSession(
  instanceId: string,
  seq: number,
  input: { status: string; canceledReason?: string; skippedReason?: string },
): Promise<{ id: string; status: string }> {
  return requestJson(`/api/procedure-protocols/instances/${instanceId}/sessions/${seq}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}
