export type PlatformHealthLevel = "HEALTHY" | "ATTENTION" | "CRITICAL";

export type PlatformTenantStatus = "ACTIVE" | "INACTIVE" | "SUSPENDED";
export type PlatformSubscriptionStatus =
  | "TRIAL"
  | "ACTIVE"
  | "PAST_DUE"
  | "CANCELED"
  | "EXPIRED";

export interface PlatformDashboardRevenueBreakdown {
  currency: string;
  contractedMrrCents: number;
  pastDueExposureCents: number;
  trialPipelineCents: number;
}

export interface PlatformDashboardPlanMixItem {
  planId: string;
  code: string;
  name: string;
  currency: string;
  tenantCount: number;
  contractedMrrCents: number;
}

export interface PlatformDashboardTenantSnapshot {
  id: string;
  slug: string;
  name: string;
  timezone: string;
  status: PlatformTenantStatus;
  createdAt: string;
  updatedAt: string;
  currentPlan: {
    id: string;
    code: string;
    name: string;
    status: PlatformSubscriptionStatus;
    priceCents: number;
    currency: string;
    startsAt: string;
    endsAt: string | null;
  } | null;
  metrics: {
    operators: number;
    units: number;
    professionals: number;
    consultationTypes: number;
    patients: number;
    appointments: number;
  };
  readiness: {
    hasClinicProfile: boolean;
    hasOperators: boolean;
    hasScheduleBase: boolean;
    hasPatients: boolean;
    hasAppointments: boolean;
  };
}

export interface PlatformDashboardRecentActivityItem {
  id: string;
  action: string;
  actorName: string | null;
  actorEmail: string | null;
  actorProfile: string;
  tenantId: string | null;
  tenantName: string | null;
  targetType: string;
  targetId: string | null;
  createdAt: string;
}

export type PlatformOperationalCheckStatus = "ok" | "degraded" | "error";

export interface PlatformOperationalDependencyCheck {
  status: PlatformOperationalCheckStatus;
  issues: string[];
}

export interface PlatformOperationalTenantMetricReference {
  tenantId: string;
  tenantName: string;
  timezone: string;
  value: number;
  sampleSize: number;
}

export interface PlatformOperationalTenantVolumeReference {
  tenantId: string;
  tenantName: string;
  timezone: string;
  total: number;
  automatic: number;
  manual: number;
  closed: number;
}

export interface PlatformOperationalTenantCountReference {
  tenantId: string;
  tenantName: string;
  timezone: string;
  total: number;
}

export interface PlatformOperationalTenantCoverage {
  active: number;
  available: number;
  unavailable: number;
}

export interface PlatformOperationalRateAggregate {
  available: boolean;
  methodology: string;
  unavailableReason: string | null;
  weightedAverageRate: number | null;
  numerator: number;
  denominator: number;
  tenantCoverage: PlatformOperationalTenantCoverage;
  highestRateTenants: PlatformOperationalTenantMetricReference[];
}

export interface PlatformOperationalDurationAggregate {
  available: boolean;
  methodology: string;
  unavailableReason: string | null;
  averageMinutes: number | null;
  sampleCount: number;
  pendingCount: number;
  tenantCoverage: PlatformOperationalTenantCoverage;
  sourceMix?: {
    agent: number;
    human: number;
    unknown: number;
  };
  slowestTenants: PlatformOperationalTenantMetricReference[];
}

export interface PlatformOperationalOccupancyAggregate {
  available: boolean;
  methodology: string;
  unavailableReason: string | null;
  weightedAverageRate: number | null;
  bookedMinutes: number;
  availableMinutes: number;
  blockedMinutes: number;
  tenantCoverage: PlatformOperationalTenantCoverage;
  lowestOccupancyTenants: PlatformOperationalTenantMetricReference[];
}

export interface PlatformOperationalHandoffAggregate {
  available: boolean;
  methodology: string;
  unavailableReason: string | null;
  total: number;
  automatic: number;
  manual: number;
  closed: number;
  tenantCoverage: PlatformOperationalTenantCoverage;
  highestVolumeTenants: PlatformOperationalTenantVolumeReference[];
}

export interface PlatformOperationalResolvedWithoutHumanAggregate {
  available: boolean;
  methodology: string;
  unavailableReason: string | null;
  total: number;
  tenantCoverage: PlatformOperationalTenantCoverage;
  highestVolumeTenants: PlatformOperationalTenantCountReference[];
}

export interface PlatformDashboardOperationsCommandCenter {
  periodDays: number;
  scope: {
    activeTenants: number;
    inactiveOrSuspendedTenants: number;
    tenantsWithScheduleBase: number;
    tenantsMissingScheduleBase: number;
  };
  noShowRate: PlatformOperationalRateAggregate;
  firstResponseTime: PlatformOperationalDurationAggregate;
  confirmationOrRescheduleTime: PlatformOperationalDurationAggregate;
  agendaOccupancyRate: PlatformOperationalOccupancyAggregate;
  handoffVolume: PlatformOperationalHandoffAggregate;
  resolvedWithoutHumanIntervention: PlatformOperationalResolvedWithoutHumanAggregate;
  knownGaps: string[];
}

export interface PlatformAgentSkillSummary {
  skillName: string;
  totalExecutions: number;
  failedExecutions: number;
  failureRate: number;
}

export interface PlatformAgentTenantSummary {
  tenantId: string;
  tenantName: string;
  timezone: string;
  totalExecutions: number;
  uniqueThreads: number;
  handoffOpened: number;
  failed: number;
  handoffRate: number;
  failureRate: number;
}

export interface PlatformDashboardAgentsCommandCenter {
  periodDays: number;
  available: boolean;
  methodology: string;
  unavailableReason: string | null;
  totalExecutions: number;
  uniqueThreads: number;
  waitingForInput: number;
  handoffOpened: number;
  completed: number;
  failed: number;
  safeAutomaticResolutions: number;
  safeResolutionRate: number | null;
  handoffRate: number | null;
  failureRate: number | null;
  averageDurationMs: number | null;
  totalSkillCalls: number;
  failedSkillCalls: number;
  tenantCoverage: PlatformOperationalTenantCoverage;
  agentMix: {
    captacao: number;
    agendamento: number;
  };
  topSkills: PlatformAgentSkillSummary[];
  highestVolumeTenants: PlatformAgentTenantSummary[];
  highestFallbackTenants: PlatformAgentTenantSummary[];
  knownGaps: string[];
}

export interface PlatformDashboardAgentReadiness {
  status: PlatformOperationalCheckStatus;
  enabled: boolean;
  rolloutPercentage: number;
  metricsWindowMinutes: number;
  failureRateAlertThreshold: number;
  p95LatencyAlertMs: number;
  totalExecutions: number;
  failureRate: number;
  avgDurationMs: number;
  p95DurationMs: number;
  issues: string[];
}

export interface PlatformDashboardResponsePayload {
  generatedAt: string;
  overview: {
    healthLevel: PlatformHealthLevel;
    summary: string;
  };
  tenants: {
    total: number;
    active: number;
    inactive: number;
    suspended: number;
    readyForOperation: number;
    missingSetup: number;
    withoutClinicProfile: number;
    withoutOperators: number;
    withoutScheduleBase: number;
    withoutCurrentPlan: number;
    latest: PlatformDashboardTenantSnapshot[];
    attention: PlatformDashboardTenantSnapshot[];
  };
  subscriptions: {
    active: number;
    trial: number;
    pastDue: number;
    canceled: number;
    expired: number;
    paidPlanTenants: number;
    freePlanTenants: number;
    revenueByCurrency: PlatformDashboardRevenueBreakdown[];
    planMix: PlatformDashboardPlanMixItem[];
  };
  users: {
    total: number;
    active: number;
    invited: number;
    inactive: number;
    suspended: number;
    platformAdmins: number;
    clinicOperators: number;
    receptions: number;
    professionals: number;
  };
  operations: {
    totalPatients: number;
    totalProfessionals: number;
    totalUnits: number;
    appointmentsNext24Hours: number;
    pendingConfirmationNext24Hours: number;
    checkInsLast24Hours: number;
    canceledLast30Days: number;
    noShowsLast30Days: number;
    activeSlotHolds: number;
    staleActiveSlotHolds: number;
    commandCenter: PlatformDashboardOperationsCommandCenter;
  };
  operationalReadiness: {
    status: PlatformOperationalCheckStatus;
    environment: string;
    database: PlatformOperationalDependencyCheck & {
      latencyMs: number | null;
    };
    payment: PlatformOperationalDependencyCheck & {
      provider: "mock" | "stripe";
      mockCheckoutEnabled: boolean;
      webhookConfigured: boolean;
    };
    messaging: PlatformOperationalDependencyCheck & {
      metaEnabled: boolean;
      activeMetaConnections: number;
      activeMetaConnectionsMissingPhoneNumberId: number;
    };
  };
  agents: {
    readiness: PlatformDashboardAgentReadiness;
    commandCenter: PlatformDashboardAgentsCommandCenter;
  };
  recentActivity: PlatformDashboardRecentActivityItem[];
}
