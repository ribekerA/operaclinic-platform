export type ProfessionalLinkedUserStatus =
  | "INVITED"
  | "ACTIVE"
  | "INACTIVE"
  | "SUSPENDED";

export interface ProfessionalLinkedUserSummary {
  id: string;
  email: string;
  fullName: string;
  status: ProfessionalLinkedUserStatus;
}

export type ProfessionalWorkspaceAppointmentStatus =
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

export type ProfessionalWorkspaceActionStatus =
  | "CALLED"
  | "IN_PROGRESS"
  | "AWAITING_CLOSURE"
  | "AWAITING_PAYMENT"
  | "NO_SHOW";

export interface ProfessionalWorkspaceStatusActionPayload {
  status: ProfessionalWorkspaceActionStatus;
  reason?: string;
}

export interface ProfessionalWorkspaceNotesPayload {
  notes?: string;
}

export interface ProfessionalWorkspacePatientContact {
  type: "PHONE" | "WHATSAPP";
  value: string;
  isPrimary: boolean;
}

export interface ProfessionalWorkspacePatientAppointmentSummary {
  id: string;
  startsAt: string;
  endsAt: string;
  status: ProfessionalWorkspaceAppointmentStatus;
  consultationTypeName: string;
  professionalName: string;
  unitName: string | null;
  room: string | null;
  notes: string | null;
}

export interface ProfessionalWorkspacePatientSummaryResponse {
  patient: {
    id: string;
    fullName: string | null;
    birthDate: string | null;
    documentNumber: string | null;
    notes: string | null;
    isActive: boolean;
    contacts: ProfessionalWorkspacePatientContact[];
  };
  relationship: {
    appointmentsWithProfessional: number;
    lastSeenAt: string | null;
    nextAppointmentAt: string | null;
  };
  alerts: {
    hasHistoricalIntercurrence: boolean;
    lastIntercurrenceAt: string | null;
    lastIntercurrenceSummary: string | null;
    lastPreparationSummary: string | null;
    lastGuidanceSummary: string | null;
  };
  recentAppointments: ProfessionalWorkspacePatientAppointmentSummary[];
}

export interface ProfessionalWorkspaceAgendaItem {
  id: string;
  status: ProfessionalWorkspaceAppointmentStatus;
  startsAt: string;
  endsAt: string;
  room: string | null;
  unitName: string | null;
  consultationTypeName: string;
  patientId: string;
  patientName: string | null;
  patientBirthDate: string | null;
  patientPrimaryContact: string | null;
  confirmedAt: string | null;
  checkedInAt: string | null;
  calledAt: string | null;
  startedAt: string | null;
  closureReadyAt: string | null;
  awaitingPaymentAt: string | null;
  completedAt: string | null;
  notes: string | null;
  hasHistoricalIntercurrence: boolean;
  lastIntercurrenceAt: string | null;
  lastIntercurrenceSummary: string | null;
  lastPreparationSummary: string | null;
  lastGuidanceSummary: string | null;
}

export interface ProfessionalWorkspaceDashboardResponse {
  generatedAt: string;
  timezone: string;
  date: string;
  clinicDisplayName: string | null;
  professional: {
    id: string;
    fullName: string;
    displayName: string;
    credential: string;
    linkedUser: ProfessionalLinkedUserSummary | null;
    specialties: Array<{
      id: string;
      name: string;
    }>;
    units: Array<{
      id: string;
      name: string;
    }>;
  };
  summary: {
    appointmentsToday: number;
    remainingToday: number;
    checkedInWaiting: number;
    calledToRoom: number;
    inProgress: number;
    awaitingClosure: number;
    sentToReception: number;
    completedToday: number;
    pendingConfirmation: number;
  };
  focus: {
    calledPatient: ProfessionalWorkspaceAgendaItem | null;
    currentAppointment: ProfessionalWorkspaceAgendaItem | null;
    closingAppointment: ProfessionalWorkspaceAgendaItem | null;
    waitingPatient: ProfessionalWorkspaceAgendaItem | null;
    nextAppointment: ProfessionalWorkspaceAgendaItem | null;
  };
  recentCompleted: ProfessionalWorkspaceAgendaItem[];
  todayAgenda: ProfessionalWorkspaceAgendaItem[];
  upcomingAgenda: ProfessionalWorkspaceAgendaItem[];
}

export interface ProfessionalWorkspaceRealtimeEvent {
  appointmentId: string;
  tenantId: string;
  professionalId: string;
  status: ProfessionalWorkspaceAppointmentStatus;
  event:
    | "APPOINTMENT_CREATED"
    | "APPOINTMENT_UPDATED"
    | "APPOINTMENT_STATUS_CHANGED"
    | "APPOINTMENT_NOTES_UPDATED";
  occurredAt: string;
}
