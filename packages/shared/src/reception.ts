export type ReceptionAppointmentStatus =
  | "BOOKED"
  | "CONFIRMED"
  | "CHECKED_IN"
  | "CALLED"
  | "IN_PROGRESS"
  | "AWAITING_CLOSURE"
  | "AWAITING_PAYMENT"
  | "RESCHEDULED"
  | "CANCELED"
  | "COMPLETED"
  | "NO_SHOW";

export type ReceptionOperationalStatusAction = Extract<
  ReceptionAppointmentStatus,
  "CONFIRMED" | "CHECKED_IN" | "CANCELED" | "NO_SHOW" | "COMPLETED"
>;

export interface ReceptionDateQuery {
  date?: string;
  professionalId?: string;
  unitId?: string;
}

export interface ReceptionAvailabilityQuery {
  professionalId: string;
  consultationTypeId: string;
  date: string;
  unitId?: string;
}

export interface ReceptionAvailabilitySlot {
  startsAt: string;
  endsAt: string;
  occupancyStartsAt: string;
  occupancyEndsAt: string;
  professionalId: string;
  unitId: string | null;
}

export interface ReceptionPatientSearchQuery {
  search?: string;
  contactValue?: string;
  limit?: string;
}

export interface CreateReceptionAppointmentPayload {
  patientId: string;
  professionalId: string;
  consultationTypeId: string;
  procedureProtocolId?: string;
  unitId?: string;
  slotHoldId?: string;
  room?: string;
  startsAt: string;
  notes?: string;
  idempotencyKey: string;
}

export interface RescheduleReceptionAppointmentPayload {
  startsAt: string;
  unitId?: string;
  room?: string;
  reason?: string;
}

export interface CancelReceptionAppointmentPayload {
  reason: string;
}

export interface ReceptionStatusActionPayload {
  reason?: string;
}

export interface ReceptionUpdateAppointmentStatusPayload {
  status: ReceptionOperationalStatusAction;
  reason?: string;
}

export interface ReceptionStatusHistoryEntry {
  id: string;
  fromStatus: ReceptionAppointmentStatus | null;
  toStatus: ReceptionAppointmentStatus;
  reason: string | null;
  metadata: Record<string, unknown> | null;
  changedByUserId: string | null;
  createdAt: string;
}

export interface ReceptionPatientSummary {
  id: string;
  fullName: string | null;
  birthDate: string | null;
  documentNumber: string | null;
  notes: string | null;
  isActive: boolean;
  contacts: Array<{
    id: string;
    type: "PHONE" | "WHATSAPP";
    value: string;
    normalizedValue: string;
    isPrimary: boolean;
  }>;
}

export interface ReceptionAgendaAppointment {
  id: string;
  status: ReceptionAppointmentStatus;
  startsAt: string;
  endsAt: string;
  room: string | null;
  unitId: string | null;
  unitName: string | null;
  professionalId: string;
  professionalName: string;
  consultationTypeId: string;
  consultationTypeName: string;
  patientId: string;
  patientName: string | null;
  patientPrimaryContact: string | null;
  checkedInAt: string | null;
  confirmedAt: string | null;
  calledAt: string | null;
  startedAt: string | null;
  closureReadyAt: string | null;
  awaitingPaymentAt: string | null;
  completedAt: string | null;
  cancellationReason: string | null;
}

export interface ReceptionAppointmentDetail extends ReceptionAgendaAppointment {
  tenantId: string;
  slotHoldId: string | null;
  durationMinutes: number;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  idempotencyKey: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  statusHistory: ReceptionStatusHistoryEntry[];
  patient: ReceptionPatientSummary;
}

export interface ReceptionDashboardResponse {
  timezone: string;
  date: string;
  totals: {
    totalAppointments: number;
    pendingConfirmation: number;
    checkedIn: number;
    inService: number;
    awaitingPayment: number;
    canceled: number;
    noShow: number;
  };
  queue: ReceptionAgendaAppointment[];
  nextAppointments: ReceptionAgendaAppointment[];
}

export interface ReceptionDayAgendaResponse {
  timezone: string;
  date: string;
  appointments: ReceptionAgendaAppointment[];
}
