import type {
  CancelReceptionAppointmentPayload,
  CreateReceptionAppointmentPayload,
  ReceptionAppointmentDetail,
  ReceptionAvailabilityQuery,
  ReceptionAvailabilitySlot,
  ReceptionDateQuery,
  ReceptionDashboardResponse,
  ReceptionDayAgendaResponse,
  ReceptionOperationalStatusAction,
  ReceptionPatientSummary,
  ReceptionPatientSearchQuery,
  ReceptionStatusActionPayload,
  RescheduleReceptionAppointmentPayload,
  ReceptionUpdateAppointmentStatusPayload,
} from "@operaclinic/shared";
import { requestJson } from "@/lib/client/http";

function buildQuery(query?: object): string {
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

export async function getReceptionDashboard(
  query?: ReceptionDateQuery,
): Promise<ReceptionDashboardResponse> {
  return requestJson<ReceptionDashboardResponse>(
    `/api/reception/dashboard${buildQuery(query)}`,
  );
}

export async function getReceptionDayAgenda(
  query?: ReceptionDateQuery,
): Promise<ReceptionDayAgendaResponse> {
  return requestJson<ReceptionDayAgendaResponse>(
    `/api/reception/day-agenda${buildQuery(query)}`,
  );
}

export async function searchReceptionPatients(
  query?: ReceptionPatientSearchQuery,
): Promise<ReceptionPatientSummary[]> {
  return requestJson<ReceptionPatientSummary[]>(
    `/api/reception/patients${buildQuery(query)}`,
  );
}

export async function searchReceptionAvailability(
  query: ReceptionAvailabilityQuery,
): Promise<ReceptionAvailabilitySlot[]> {
  return requestJson<ReceptionAvailabilitySlot[]>(
    `/api/reception/availability${buildQuery(query)}`,
  );
}

export async function getReceptionAppointment(
  appointmentId: string,
): Promise<ReceptionAppointmentDetail> {
  return requestJson<ReceptionAppointmentDetail>(
    `/api/reception/appointments/${appointmentId}`,
  );
}

export async function createReceptionAppointment(
  payload: CreateReceptionAppointmentPayload,
): Promise<ReceptionAppointmentDetail> {
  return requestJson<ReceptionAppointmentDetail>("/api/reception/appointments", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function rescheduleReceptionAppointment(
  appointmentId: string,
  payload: RescheduleReceptionAppointmentPayload,
): Promise<ReceptionAppointmentDetail> {
  return requestJson<ReceptionAppointmentDetail>(
    `/api/reception/appointments/${appointmentId}/reschedule`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
  );
}

export async function cancelReceptionAppointment(
  appointmentId: string,
  payload: CancelReceptionAppointmentPayload,
): Promise<ReceptionAppointmentDetail> {
  return requestJson<ReceptionAppointmentDetail>(
    `/api/reception/appointments/${appointmentId}/cancel`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
  );
}

export async function confirmReceptionAppointment(
  appointmentId: string,
  payload: ReceptionStatusActionPayload = {},
): Promise<ReceptionAppointmentDetail> {
  return requestJson<ReceptionAppointmentDetail>(
    `/api/reception/appointments/${appointmentId}/confirm`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
  );
}

export async function checkInReceptionAppointment(
  appointmentId: string,
  payload: ReceptionStatusActionPayload = {},
): Promise<ReceptionAppointmentDetail> {
  return requestJson<ReceptionAppointmentDetail>(
    `/api/reception/appointments/${appointmentId}/check-in`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
  );
}

export async function markReceptionAppointmentAsNoShow(
  appointmentId: string,
  payload: ReceptionStatusActionPayload = {},
): Promise<ReceptionAppointmentDetail> {
  return requestJson<ReceptionAppointmentDetail>(
    `/api/reception/appointments/${appointmentId}/no-show`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
  );
}

export async function updateReceptionAppointmentStatus(
  appointmentId: string,
  payload: ReceptionUpdateAppointmentStatusPayload,
): Promise<ReceptionAppointmentDetail> {
  return requestJson<ReceptionAppointmentDetail>(
    `/api/reception/appointments/${appointmentId}/status`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
  );
}

export type { ReceptionOperationalStatusAction };
export type {
  CancelReceptionAppointmentPayload,
  CreateReceptionAppointmentPayload,
  ReceptionAvailabilityQuery,
  ReceptionAvailabilitySlot,
  ReceptionDateQuery,
  ReceptionPatientSearchQuery,
  ReceptionStatusActionPayload,
  RescheduleReceptionAppointmentPayload,
};
