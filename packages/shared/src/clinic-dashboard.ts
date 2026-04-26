export interface AestheticClinicExecutiveDashboardQuery {
  periodDays?: string;
}

export interface AestheticClinicDashboardTimelinePoint {
  dayKey: string;
  dayLabel: string;
  total: number;
  noShow: number;
  noShowRate: number;
}

export interface AestheticClinicDashboardConsultationTypeNoShow {
  consultationTypeId: string;
  consultationTypeName: string;
  total: number;
  noShow: number;
  noShowRate: number;
}

export interface AestheticClinicDashboardProfessionalPerformance {
  professionalId: string;
  professionalName: string;
  total: number;
  completed: number;
  noShow: number;
  completionRate: number;
  noShowRate: number;
}

export interface AestheticClinicDashboardWorkloadByHour {
  hourLabel: string;
  total: number;
}

export interface AestheticClinicExecutiveDashboardResponse {
  generatedAt: string;
  clinicDisplayName: string | null;
  timezone: string;
  periodDays: number;
  range: {
    startsAt: string;
    endsAt: string;
  };
  appointments: {
    total: number;
    completed: number;
    canceled: number;
    noShow: number;
    checkedIn: number;
    pendingConfirmation: number;
    completionRate: number;
    cancellationRate: number;
    noShowRate: number;
    averageCheckInDelayMinutes: number | null;
    averageEarlyCheckInMinutes: number | null;
  };
  finance: {
    subscriptionStatus: "TRIAL" | "ACTIVE" | "PAST_DUE" | "CANCELED" | "EXPIRED" | null;
    planName: string | null;
    currency: string | null;
    monthlyRevenueCents: number;
    isPastDue: boolean;
    startsAt: string | null;
    endsAt: string | null;
  };
  quality: {
    utilizationRate: number;
    consultationTypeNoShow: AestheticClinicDashboardConsultationTypeNoShow[];
    professionalPerformance: AestheticClinicDashboardProfessionalPerformance[];
    workloadByHour: AestheticClinicDashboardWorkloadByHour[];
    noShowTimeline: AestheticClinicDashboardTimelinePoint[];
  };
  agent: {
    totalConversations: number;
    qualifiedLeads: number;
    conversionToAppointmentRate: number;
    escalationRate: number;
    escalationReasons: AestheticClinicDashboardAgentEscalationReason[];
  };
}

export interface AestheticClinicDashboardAgentEscalationReason {
  reason: string;
  count: number;
  percentage: number;
}

export interface AestheticClinicTraceableKpiBase {
  available: boolean;
  methodology: string;
  unavailableReason: string | null;
}

export interface AestheticClinicNoShowKpi
  extends AestheticClinicTraceableKpiBase {
  rate: number | null;
  noShowAppointments: number;
  attendanceOutcomeAppointments: number;
}

export interface AestheticClinicFirstResponseTimeKpi
  extends AestheticClinicTraceableKpiBase {
  averageMinutes: number | null;
  respondedConversationWindows: number;
  pendingConversationWindows: number;
  agentFirstResponses: number;
  humanFirstResponses: number;
  unknownFirstResponses: number;
}

export interface AestheticClinicConfirmationOrRescheduleTimeKpi
  extends AestheticClinicTraceableKpiBase {
  averageMinutes: number | null;
  resolvedAppointments: number;
  confirmedAppointments: number;
  rescheduledAppointments: number;
  pendingAppointments: number;
}

export interface AestheticClinicAgendaOccupancyKpi
  extends AestheticClinicTraceableKpiBase {
  rate: number | null;
  bookedMinutes: number;
  availableMinutes: number;
  blockedMinutes: number;
}

export interface AestheticClinicOnboardingActivationKpi
  extends AestheticClinicTraceableKpiBase {
  onboardingId: string | null;
  onboardingStatus:
    | "INITIATED"
    | "AWAITING_PAYMENT"
    | "PAID"
    | "ONBOARDING_STARTED"
    | "ONBOARDING_COMPLETED"
    | "EXPIRED"
    | "ESCALATED_TO_STAFF"
    | null;
  initiatedAt: string | null;
  checkoutConfirmedAt: string | null;
  activationStartedAt: string | null;
  activatedAt: string | null;
  totalHours: number | null;
  paymentLeadTimeHours: number | null;
  checkoutToActivationHours: number | null;
}

export interface AestheticClinicHandoffVolumeKpi
  extends AestheticClinicTraceableKpiBase {
  total: number;
  automatic: number;
  manual: number;
  closed: number;
}

export interface AestheticClinicResolvedWithoutHumanKpi
  extends AestheticClinicTraceableKpiBase {
  total: number | null;
}

export interface AestheticClinicOperationalKpisResponse {
  generatedAt: string;
  tenantId: string;
  timezone: string;
  periodDays: number;
  range: {
    startsAt: string;
    endsAt: string;
  };
  kpis: {
    noShowRate: AestheticClinicNoShowKpi;
    firstResponseTime: AestheticClinicFirstResponseTimeKpi;
    confirmationOrRescheduleTime: AestheticClinicConfirmationOrRescheduleTimeKpi;
    agendaOccupancyRate: AestheticClinicAgendaOccupancyKpi;
    onboardingActivationTime: AestheticClinicOnboardingActivationKpi;
    handoffVolume: AestheticClinicHandoffVolumeKpi;
    resolvedWithoutHumanIntervention: AestheticClinicResolvedWithoutHumanKpi;
  };
}
