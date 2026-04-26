import { AppointmentStatus } from "@prisma/client";

export interface AppointmentResponse {
  id: string;
  tenantId: string;
  patientId: string;
  professionalId: string;
  consultationTypeId: string;
  unitId: string | null;
  slotHoldId: string | null;
  room: string | null;
  startsAt: Date;
  endsAt: Date;
  durationMinutes: number;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  status: AppointmentStatus;
  confirmedAt: Date | null;
  checkedInAt: Date | null;
  calledAt: Date | null;
  startedAt: Date | null;
  closureReadyAt: Date | null;
  awaitingPaymentAt: Date | null;
  completedAt: Date | null;
  noShowAt: Date | null;
  idempotencyKey: string;
  cancellationReason: string | null;
  notes: string | null;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
  patient: {
    id: string;
    fullName: string | null;
  };
  professional: {
    id: string;
    fullName: string;
    displayName: string;
  };
  consultationType: {
    id: string;
    name: string;
    durationMinutes: number;
    bufferBeforeMinutes: number;
    bufferAfterMinutes: number;
  };
  unit: {
    id: string;
    name: string;
  } | null;
}
