import type {
  ProfessionalWorkspaceDashboardResponse,
  ProfessionalWorkspaceNotesPayload,
  ProfessionalWorkspacePatientSummaryResponse,
  ProfessionalWorkspaceStatusActionPayload,
} from "@operaclinic/shared";
import { requestJson } from "@/lib/client/http";

export async function getProfessionalWorkspaceDashboard(): Promise<ProfessionalWorkspaceDashboardResponse> {
  return requestJson<ProfessionalWorkspaceDashboardResponse>(
    "/api/professional/dashboard",
  );
}

export async function updateProfessionalAppointmentStatus(
  appointmentId: string,
  payload: ProfessionalWorkspaceStatusActionPayload,
): Promise<ProfessionalWorkspaceDashboardResponse> {
  return requestJson<ProfessionalWorkspaceDashboardResponse>(
    `/api/professional/appointments/${appointmentId}/status`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
  );
}

export async function getProfessionalPatientSummary(
  patientId: string,
): Promise<ProfessionalWorkspacePatientSummaryResponse> {
  return requestJson<ProfessionalWorkspacePatientSummaryResponse>(
    `/api/professional/patients/${patientId}/summary`,
  );
}

export async function updateProfessionalAppointmentNotes(
  appointmentId: string,
  payload: ProfessionalWorkspaceNotesPayload,
): Promise<ProfessionalWorkspaceDashboardResponse> {
  return requestJson<ProfessionalWorkspaceDashboardResponse>(
    `/api/professional/appointments/${appointmentId}/notes`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
  );
}
