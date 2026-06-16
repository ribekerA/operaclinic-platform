import { requestJson, toErrorMessage } from "@/lib/client/http";

export interface PublicClinicInfo {
  tenantId: string;
  clinicName: string;
  displayName: string;
  timezone: string;
  professionals: Array<{
    id: string;
    displayName: string;
    specialties: Array<{ id: string; name: string }>;
  }>;
  consultationTypes: Array<{
    id: string;
    name: string;
    durationMinutes: number;
    aestheticArea: string | null;
  }>;
}

export interface PublicSlot {
  startsAt: string;
  endsAt: string;
  professionalId: string;
  consultationTypeId: string;
  unitId: string | null;
}

export interface BookAppointmentInput {
  professionalId: string;
  consultationTypeId: string;
  startsAt: string;
  unitId?: string;
  patientName: string;
  patientPhone: string;
  patientEmail?: string;
  notes?: string;
}

export interface BookAppointmentResult {
  appointmentId: string;
  startsAt: string;
  confirmationCode: string;
}

export async function getPublicClinicInfo(slug: string): Promise<PublicClinicInfo> {
  return requestJson<PublicClinicInfo>(`/api/public/${slug}`);
}

export async function getPublicAvailability(
  slug: string,
  params: { professionalId: string; consultationTypeId: string; date: string },
): Promise<PublicSlot[]> {
  const qs = new URLSearchParams(params).toString();
  return requestJson<PublicSlot[]>(`/api/public/${slug}/availability?${qs}`);
}

export async function bookPublicAppointment(
  slug: string,
  input: BookAppointmentInput,
): Promise<BookAppointmentResult> {
  return requestJson<BookAppointmentResult>(`/api/public/${slug}/book`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export { toErrorMessage };
