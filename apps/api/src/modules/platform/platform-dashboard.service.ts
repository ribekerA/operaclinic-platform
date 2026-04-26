import { Injectable } from "@nestjs/common";
import {
  AgentExecutionStatus,
  AgentKind,
  AppointmentStatus,
  MessageThreadResolutionActorType,
  Prisma,
  RoleCode,
  SlotHoldStatus,
  SubscriptionStatus,
  TenantStatus,
  UserStatus,
} from "@prisma/client";
import type {
  AestheticClinicOperationalKpisResponse,
  PlatformDashboardAgentReadiness,
  PlatformDashboardAgentsCommandCenter,
  PlatformDashboardPlanMixItem,
  PlatformDashboardOperationsCommandCenter,
  PlatformDashboardResponsePayload,
  PlatformDashboardRevenueBreakdown,
  PlatformDashboardTenantSnapshot,
  PlatformHealthLevel,
} from "@operaclinic/shared";
import { PrismaService } from "../../database/prisma.service";
import { ClinicOperationalKpisService } from "../clinic-insights/clinic-operational-kpis.service";
import { HealthService } from "../health/health.service";

const SUBSCRIPTION_OPEN_STATUSES: SubscriptionStatus[] = [
  SubscriptionStatus.TRIAL,
  SubscriptionStatus.ACTIVE,
  SubscriptionStatus.PAST_DUE,
];
const COMMAND_CENTER_PERIOD_DAYS = 30;
const MAX_OPERATIONAL_HIGHLIGHTS = 5;

type TenantDashboardRecord = Awaited<
  ReturnType<PlatformDashboardService["loadTenantRecords"]>
>[number];
type TenantOperationalSnapshotRecord = {
  tenant: PlatformDashboardTenantSnapshot;
  snapshot: AestheticClinicOperationalKpisResponse;
};

@Injectable()
export class PlatformDashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly healthService: HealthService,
    private readonly clinicOperationalKpisService: ClinicOperationalKpisService,
  ) {}

  async getDashboard(): Promise<PlatformDashboardResponsePayload> {
    const now = new Date();
    const next24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [
      tenantRecords,
      totalUsers,
      activeUsers,
      invitedUsers,
      inactiveUsers,
      suspendedUsers,
      platformAdmins,
      clinicOperators,
      receptions,
      professionals,
      totalPatients,
      totalProfessionals,
      totalUnits,
      appointmentsNext24Hours,
      pendingConfirmationNext24Hours,
      checkInsLast24Hours,
      canceledLast30Days,
      noShowsLast30Days,
      activeSlotHolds,
      staleActiveSlotHolds,
      recentActivity,
      readiness,
    ] = await Promise.all([
      this.loadTenantRecords(),
      this.prisma.user.count(),
      this.prisma.user.count({ where: { status: UserStatus.ACTIVE } }),
      this.prisma.user.count({ where: { status: UserStatus.INVITED } }),
      this.prisma.user.count({ where: { status: UserStatus.INACTIVE } }),
      this.prisma.user.count({ where: { status: UserStatus.SUSPENDED } }),
      this.prisma.user.count({
        where: {
          userRoles: {
            some: {
              tenantId: null,
              role: {
                code: {
                  in: [RoleCode.SUPER_ADMIN, RoleCode.PLATFORM_ADMIN],
                },
              },
            },
          },
        },
      }),
      this.prisma.user.count({
        where: {
          userRoles: {
            some: {
              tenantId: { not: null },
              role: {
                code: {
                  in: [
                    RoleCode.TENANT_ADMIN,
                    RoleCode.CLINIC_MANAGER,
                    RoleCode.RECEPTION,
                  ],
                },
              },
            },
          },
        },
      }),
      this.prisma.user.count({
        where: {
          userRoles: {
            some: {
              role: { code: RoleCode.RECEPTION },
            },
          },
        },
      }),
      this.prisma.user.count({
        where: {
          userRoles: {
            some: {
              role: { code: RoleCode.PROFESSIONAL },
            },
          },
        },
      }),
      this.prisma.patient.count(),
      this.prisma.professional.count(),
      this.prisma.unit.count(),
      this.prisma.appointment.count({
        where: {
          startsAt: {
            gte: now,
            lt: next24Hours,
          },
          status: {
            in: [
              AppointmentStatus.BOOKED,
              AppointmentStatus.CONFIRMED,
              AppointmentStatus.CHECKED_IN,
              AppointmentStatus.CALLED,
              AppointmentStatus.IN_PROGRESS,
              AppointmentStatus.AWAITING_CLOSURE,
              AppointmentStatus.AWAITING_PAYMENT,
            ],
          },
        },
      }),
      this.prisma.appointment.count({
        where: {
          startsAt: {
            gte: now,
            lt: next24Hours,
          },
          status: AppointmentStatus.BOOKED,
        },
      }),
      this.prisma.appointmentStatusHistory.count({
        where: {
          toStatus: AppointmentStatus.CHECKED_IN,
          createdAt: { gte: last24Hours },
        },
      }),
      this.prisma.appointmentStatusHistory.count({
        where: {
          toStatus: AppointmentStatus.CANCELED,
          createdAt: { gte: last30Days },
        },
      }),
      this.prisma.appointmentStatusHistory.count({
        where: {
          toStatus: AppointmentStatus.NO_SHOW,
          createdAt: { gte: last30Days },
        },
      }),
      this.prisma.slotHold.count({
        where: {
          status: SlotHoldStatus.ACTIVE,
          expiresAt: { gt: now },
        },
      }),
      this.prisma.slotHold.count({
        where: {
          status: SlotHoldStatus.ACTIVE,
          expiresAt: { lte: now },
        },
      }),
      this.prisma.auditLog.findMany({
        orderBy: { createdAt: "desc" },
        take: 12,
        include: {
          actorUser: {
            select: {
              fullName: true,
              email: true,
            },
          },
          tenant: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      }),
      this.healthService.getReadiness(),
    ]);

    const tenantSnapshots = tenantRecords.map((tenant) =>
      this.mapTenantSnapshot(tenant),
    );

    const readyForOperation = tenantSnapshots.filter((tenant) =>
      tenant.readiness.hasClinicProfile &&
      tenant.readiness.hasOperators &&
      tenant.readiness.hasScheduleBase
    ).length;
    const withoutClinicProfile = tenantSnapshots.filter(
      (tenant) => !tenant.readiness.hasClinicProfile,
    ).length;
    const withoutOperators = tenantSnapshots.filter(
      (tenant) => !tenant.readiness.hasOperators,
    ).length;
    const withoutScheduleBase = tenantSnapshots.filter(
      (tenant) => !tenant.readiness.hasScheduleBase,
    ).length;
    const withoutCurrentPlan = tenantSnapshots.filter(
      (tenant) => tenant.currentPlan === null,
    ).length;
    const missingSetup = tenantSnapshots.filter(
      (tenant) =>
        !tenant.readiness.hasClinicProfile ||
        !tenant.readiness.hasOperators ||
        !tenant.readiness.hasScheduleBase,
    ).length;
    const suspendedTenants = tenantSnapshots.filter(
      (tenant) => tenant.status === TenantStatus.SUSPENDED,
    ).length;

    const latest = [...tenantSnapshots]
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, 6);

    const attention = [...tenantSnapshots]
      .filter((tenant) => this.resolveTenantAttentionScore(tenant) > 0)
      .sort(
        (left, right) =>
          this.resolveTenantAttentionScore(right) -
            this.resolveTenantAttentionScore(left) ||
          right.updatedAt.localeCompare(left.updatedAt),
      )
      .slice(0, 6);

    const subscriptionStatusCounts = {
      active: 0,
      trial: 0,
      pastDue: 0,
      canceled: 0,
      expired: 0,
    };

    let paidPlanTenants = 0;
    let freePlanTenants = 0;
    const revenueByCurrency = new Map<string, PlatformDashboardRevenueBreakdown>();
    const planMix = new Map<string, PlatformDashboardPlanMixItem>();

    for (const tenant of tenantSnapshots) {
      const currentPlan = tenant.currentPlan;

      if (!currentPlan) {
        continue;
      }

      switch (currentPlan.status) {
        case SubscriptionStatus.ACTIVE:
          subscriptionStatusCounts.active += 1;
          break;
        case SubscriptionStatus.TRIAL:
          subscriptionStatusCounts.trial += 1;
          break;
        case SubscriptionStatus.PAST_DUE:
          subscriptionStatusCounts.pastDue += 1;
          break;
        case SubscriptionStatus.CANCELED:
          subscriptionStatusCounts.canceled += 1;
          break;
        case SubscriptionStatus.EXPIRED:
          subscriptionStatusCounts.expired += 1;
          break;
      }

      if (currentPlan.priceCents > 0) {
        paidPlanTenants += 1;
      } else {
        freePlanTenants += 1;
      }

      const revenueEntry =
        revenueByCurrency.get(currentPlan.currency) ?? {
          currency: currentPlan.currency,
          contractedMrrCents: 0,
          pastDueExposureCents: 0,
          trialPipelineCents: 0,
        };

      if (currentPlan.status === SubscriptionStatus.ACTIVE) {
        revenueEntry.contractedMrrCents += currentPlan.priceCents;
      }

      if (currentPlan.status === SubscriptionStatus.PAST_DUE) {
        revenueEntry.pastDueExposureCents += currentPlan.priceCents;
      }

      if (currentPlan.status === SubscriptionStatus.TRIAL) {
        revenueEntry.trialPipelineCents += currentPlan.priceCents;
      }

      revenueByCurrency.set(currentPlan.currency, revenueEntry);

      const planEntry =
        planMix.get(currentPlan.id) ?? {
          planId: currentPlan.id,
          code: currentPlan.code,
          name: currentPlan.name,
          currency: currentPlan.currency,
          tenantCount: 0,
          contractedMrrCents: 0,
        };

      planEntry.tenantCount += 1;

      if (currentPlan.status === SubscriptionStatus.ACTIVE) {
        planEntry.contractedMrrCents += currentPlan.priceCents;
      }

      planMix.set(currentPlan.id, planEntry);
    }

    const healthLevel = this.resolveHealthLevel({
      suspendedTenants,
      pastDueTenants: subscriptionStatusCounts.pastDue,
      staleActiveSlotHolds,
      missingSetup,
    });
    const commandCenter = await this.buildOperationsCommandCenter(tenantSnapshots);
    const agentsCommandCenter = await this.buildAgentsCommandCenter(
      tenantSnapshots,
      last30Days,
    );
    const agentReadiness = this.mapAgentReadiness(readiness);

    return {
      generatedAt: now.toISOString(),
      overview: {
        healthLevel,
        summary: this.buildSummary({
          healthLevel,
          staleActiveSlotHolds,
          pastDueTenants: subscriptionStatusCounts.pastDue,
          suspendedTenants,
          missingSetup,
        }),
      },
      tenants: {
        total: tenantSnapshots.length,
        active: tenantSnapshots.filter(
          (tenant) => tenant.status === TenantStatus.ACTIVE,
        ).length,
        inactive: tenantSnapshots.filter(
          (tenant) => tenant.status === TenantStatus.INACTIVE,
        ).length,
        suspended: suspendedTenants,
        readyForOperation,
        missingSetup,
        withoutClinicProfile,
        withoutOperators,
        withoutScheduleBase,
        withoutCurrentPlan,
        latest,
        attention,
      },
      subscriptions: {
        ...subscriptionStatusCounts,
        paidPlanTenants,
        freePlanTenants,
        revenueByCurrency: [...revenueByCurrency.values()].sort((left, right) =>
          left.currency.localeCompare(right.currency),
        ),
        planMix: [...planMix.values()].sort(
          (left, right) =>
            right.tenantCount - left.tenantCount ||
            right.contractedMrrCents - left.contractedMrrCents,
        ),
      },
      users: {
        total: totalUsers,
        active: activeUsers,
        invited: invitedUsers,
        inactive: inactiveUsers,
        suspended: suspendedUsers,
        platformAdmins,
        clinicOperators,
        receptions,
        professionals,
      },
      operations: {
        totalPatients,
        totalProfessionals,
        totalUnits,
        appointmentsNext24Hours,
        pendingConfirmationNext24Hours,
        checkInsLast24Hours,
        canceledLast30Days,
        noShowsLast30Days,
        activeSlotHolds,
        staleActiveSlotHolds,
        commandCenter,
      },
      operationalReadiness: {
        status: readiness.status,
        environment: readiness.environment,
        database: readiness.checks.database,
        payment: readiness.checks.payment,
        messaging: readiness.checks.messaging,
      },
      agents: {
        readiness: agentReadiness,
        commandCenter: agentsCommandCenter,
      },
      recentActivity: recentActivity.map((entry) => ({
        id: entry.id,
        action: entry.action,
        actorName: entry.actorUser?.fullName ?? null,
        actorEmail: entry.actorUser?.email ?? null,
        actorProfile: entry.actorProfile,
        tenantId: entry.tenantId,
        tenantName: entry.tenant?.name ?? null,
        targetType: entry.targetType,
        targetId: entry.targetId,
        createdAt: entry.createdAt.toISOString(),
      })),
    };
  }

  private async buildOperationsCommandCenter(
    tenantSnapshots: PlatformDashboardTenantSnapshot[],
  ): Promise<PlatformDashboardOperationsCommandCenter> {
    const activeTenants = tenantSnapshots.filter(
      (tenant) => tenant.status === TenantStatus.ACTIVE,
    );
    const settledSnapshots = await Promise.allSettled(
      activeTenants.map(async (tenant) => ({
        tenant,
        snapshot: await this.clinicOperationalKpisService.getOperationalKpisForTenant(
          tenant.id,
          { periodDays: String(COMMAND_CENTER_PERIOD_DAYS) },
        ),
      })),
    );
    const operationalSnapshots = settledSnapshots
      .filter(
        (
          result,
        ): result is PromiseFulfilledResult<TenantOperationalSnapshotRecord> =>
          result.status === "fulfilled",
      )
      .map((result) => result.value);
    const failedSnapshots = settledSnapshots.length - operationalSnapshots.length;

    return {
      periodDays: COMMAND_CENTER_PERIOD_DAYS,
      scope: {
        activeTenants: activeTenants.length,
        inactiveOrSuspendedTenants: tenantSnapshots.length - activeTenants.length,
        tenantsWithScheduleBase: activeTenants.filter(
          (tenant) => tenant.readiness.hasScheduleBase,
        ).length,
        tenantsMissingScheduleBase: activeTenants.filter(
          (tenant) => !tenant.readiness.hasScheduleBase,
        ).length,
      },
      noShowRate: this.buildNoShowAggregate(
        operationalSnapshots,
        activeTenants.length,
      ),
      firstResponseTime: this.buildFirstResponseAggregate(
        operationalSnapshots,
        activeTenants.length,
      ),
      confirmationOrRescheduleTime:
        this.buildConfirmationOrRescheduleAggregate(
          operationalSnapshots,
          activeTenants.length,
        ),
      agendaOccupancyRate: this.buildAgendaOccupancyAggregate(
        operationalSnapshots,
        activeTenants.length,
      ),
      handoffVolume: this.buildHandoffVolumeAggregate(
        operationalSnapshots,
        activeTenants.length,
      ),
      resolvedWithoutHumanIntervention:
        this.buildResolvedWithoutHumanInterventionAggregate(
          operationalSnapshots,
          activeTenants.length,
        ),
      knownGaps: [
        "resolvedWithoutHumanIntervention is explicit and aggregated, but it is still a safe terminal-outcome counter, not a causal ROI metric.",
        "agent execution is tracked in its own module, but operations still does not attribute no-show or occupancy deltas causally to automation.",
        ...(failedSnapshots > 0
          ? [
              `${failedSnapshots} active tenant snapshot(s) could not be aggregated in this request.`,
            ]
          : []),
      ],
    };
  }

  private mapAgentReadiness(
    readiness: Awaited<ReturnType<HealthService["getReadiness"]>>,
  ): PlatformDashboardAgentReadiness {
    return {
      status: readiness.checks.agent.status,
      enabled: readiness.checks.agent.enabled,
      rolloutPercentage: readiness.checks.agent.rolloutPercentage,
      metricsWindowMinutes: readiness.checks.agent.metricsWindowMinutes,
      failureRateAlertThreshold: readiness.checks.agent.failureRateAlertThreshold,
      p95LatencyAlertMs: readiness.checks.agent.p95LatencyAlertMs,
      totalExecutions: readiness.checks.agent.metrics.totalExecutions,
      failureRate: Number(
        (readiness.checks.agent.metrics.failureRate * 100).toFixed(1),
      ),
      avgDurationMs: Math.round(readiness.checks.agent.metrics.avgDurationMs),
      p95DurationMs: Math.round(readiness.checks.agent.metrics.p95DurationMs),
      issues: readiness.checks.agent.issues,
    };
  }

  private async loadRecentAgentExecutions(
    tenantIds: string[],
    rangeStart: Date,
  ) {
    if (tenantIds.length === 0) {
      return [];
    }

    return this.prisma.agentExecution.findMany({
      where: {
        tenantId: {
          in: tenantIds,
        },
        finishedAt: {
          gte: rangeStart,
        },
      },
      select: {
        tenantId: true,
        threadId: true,
        correlationId: true,
        agent: true,
        status: true,
        durationMs: true,
        skillCalls: true,
        failedSkillCalls: true,
        metadata: true,
      },
    });
  }

  private async loadRecentThreadResolutions(
    tenantIds: string[],
    rangeStart: Date,
  ) {
    if (tenantIds.length === 0) {
      return [];
    }

    return this.prisma.messageThreadResolution.findMany({
      where: {
        tenantId: {
          in: tenantIds,
        },
        occurredAt: {
          gte: rangeStart,
        },
      },
      select: {
        tenantId: true,
        actorType: true,
        correlationId: true,
        agentExecutionId: true,
      },
    });
  }

  private async buildAgentsCommandCenter(
    tenantSnapshots: PlatformDashboardTenantSnapshot[],
    rangeStart: Date,
  ): Promise<PlatformDashboardAgentsCommandCenter> {
    const activeTenants = tenantSnapshots.filter(
      (tenant) => tenant.status === TenantStatus.ACTIVE,
    );
    const activeTenantIds = activeTenants.map((tenant) => tenant.id);
    const [executions, resolutions] = await Promise.all([
      this.loadRecentAgentExecutions(activeTenantIds, rangeStart),
      this.loadRecentThreadResolutions(activeTenantIds, rangeStart),
    ]);
    const methodology =
      "persisted agent executions keyed by tenant, thread and correlationId over the selected window, segmented by status and flattened by skill trace stored in execution metadata.";

    if (executions.length === 0) {
      return {
        periodDays: COMMAND_CENTER_PERIOD_DAYS,
        available: false,
        methodology,
        unavailableReason: this.buildAggregateUnavailableReason(
          activeTenants.length,
          "No persisted agent executions were found in the selected window.",
        ),
        totalExecutions: 0,
        uniqueThreads: 0,
        waitingForInput: 0,
        handoffOpened: 0,
        completed: 0,
        failed: 0,
        safeAutomaticResolutions: 0,
        safeResolutionRate: null,
        handoffRate: null,
        failureRate: null,
        averageDurationMs: null,
        totalSkillCalls: 0,
        failedSkillCalls: 0,
        tenantCoverage: this.buildTenantCoverage(activeTenants.length, 0),
        agentMix: {
          captacao: 0,
          agendamento: 0,
        },
        topSkills: [],
        highestVolumeTenants: [],
        highestFallbackTenants: [],
        knownGaps: [
          "Safe automatic resolution only counts explicit terminal outcomes persisted by automation; waiting-for-input conversations stay outside this metric on purpose.",
          "Impact on no-show, occupancy and conversion is still indirect; causality between agent execution and business KPI is not modeled yet.",
        ],
      };
    }

    const uniqueThreads = new Set(
      executions.map((execution) => `${execution.tenantId}:${execution.threadId}`),
    ).size;
    const waitingForInput = executions.filter(
      (execution) =>
        execution.status === AgentExecutionStatus.WAITING_FOR_INPUT ||
        execution.status === AgentExecutionStatus.WAITING_FOR_SLOT_SELECTION,
    ).length;
    const handoffOpened = executions.filter(
      (execution) => execution.status === AgentExecutionStatus.HANDOFF_OPENED,
    ).length;
    const completed = executions.filter(
      (execution) => execution.status === AgentExecutionStatus.COMPLETED,
    ).length;
    const failed = executions.filter(
      (execution) => execution.status === AgentExecutionStatus.FAILED,
    ).length;
    const safeAutomaticResolutions = resolutions.filter(
      (resolution) =>
        resolution.actorType === MessageThreadResolutionActorType.AUTOMATION,
    ).length;
    const totalSkillCalls = executions.reduce(
      (total, execution) => total + execution.skillCalls,
      0,
    );
    const failedSkillCalls = executions.reduce(
      (total, execution) => total + execution.failedSkillCalls,
      0,
    );
    const averageDurationMs = this.roundToOneDecimal(
      executions.reduce((total, execution) => total + execution.durationMs, 0) /
        executions.length,
    );
    const tenantMap = new Map(
      activeTenants.map((tenant) => [tenant.id, tenant] as const),
    );
    const tenantExecutionMap = new Map<
      string,
      {
        tenant: PlatformDashboardTenantSnapshot;
        totalExecutions: number;
        uniqueThreads: Set<string>;
        handoffOpened: number;
        failed: number;
      }
    >();
    const skillTotals = new Map<
      string,
      {
        totalExecutions: number;
        failedExecutions: number;
      }
    >();

    for (const execution of executions) {
      const tenant = tenantMap.get(execution.tenantId);

      if (tenant) {
        const tenantEntry =
          tenantExecutionMap.get(execution.tenantId) ?? {
            tenant,
            totalExecutions: 0,
            uniqueThreads: new Set<string>(),
            handoffOpened: 0,
            failed: 0,
          };

        tenantEntry.totalExecutions += 1;
        tenantEntry.uniqueThreads.add(execution.threadId);

        if (execution.status === AgentExecutionStatus.HANDOFF_OPENED) {
          tenantEntry.handoffOpened += 1;
        }

        if (execution.status === AgentExecutionStatus.FAILED) {
          tenantEntry.failed += 1;
        }

        tenantExecutionMap.set(execution.tenantId, tenantEntry);
      }

      for (const step of this.extractAgentSteps(execution.metadata)) {
        const skillEntry =
          skillTotals.get(step.skillName) ?? {
            totalExecutions: 0,
            failedExecutions: 0,
          };

        skillEntry.totalExecutions += 1;

        if (step.status === "FAILED") {
          skillEntry.failedExecutions += 1;
        }

        skillTotals.set(step.skillName, skillEntry);
      }
    }

    const tenantSummaries = [...tenantExecutionMap.values()].map((entry) => ({
      tenantId: entry.tenant.id,
      tenantName: entry.tenant.name,
      timezone: entry.tenant.timezone,
      totalExecutions: entry.totalExecutions,
      uniqueThreads: entry.uniqueThreads.size,
      handoffOpened: entry.handoffOpened,
      failed: entry.failed,
      handoffRate: this.toPercentage(entry.handoffOpened, entry.totalExecutions),
      failureRate: this.toPercentage(entry.failed, entry.totalExecutions),
    }));

    return {
      periodDays: COMMAND_CENTER_PERIOD_DAYS,
      available: true,
      methodology,
      unavailableReason: null,
      totalExecutions: executions.length,
      uniqueThreads,
      waitingForInput,
      handoffOpened,
      completed,
      failed,
      safeAutomaticResolutions,
      safeResolutionRate: this.toPercentage(safeAutomaticResolutions, completed),
      handoffRate: this.toPercentage(handoffOpened, executions.length),
      failureRate: this.toPercentage(failed, executions.length),
      averageDurationMs,
      totalSkillCalls,
      failedSkillCalls,
      tenantCoverage: this.buildTenantCoverage(
        activeTenants.length,
        tenantSummaries.length,
      ),
      agentMix: {
        captacao: executions.filter(
          (execution) => execution.agent === AgentKind.CAPTACAO,
        ).length,
        agendamento: executions.filter(
          (execution) => execution.agent === AgentKind.AGENDAMENTO,
        ).length,
      },
      topSkills: [...skillTotals.entries()]
        .map(([skillName, summary]) => ({
          skillName,
          totalExecutions: summary.totalExecutions,
          failedExecutions: summary.failedExecutions,
          failureRate: this.toPercentage(
            summary.failedExecutions,
            summary.totalExecutions,
          ),
        }))
        .sort(
          (left, right) =>
            right.totalExecutions - left.totalExecutions ||
            right.failedExecutions - left.failedExecutions,
        )
        .slice(0, MAX_OPERATIONAL_HIGHLIGHTS),
      highestVolumeTenants: tenantSummaries
        .slice()
        .sort(
          (left, right) =>
            right.totalExecutions - left.totalExecutions ||
            right.uniqueThreads - left.uniqueThreads,
        )
        .slice(0, MAX_OPERATIONAL_HIGHLIGHTS),
      highestFallbackTenants: tenantSummaries
        .slice()
        .sort(
          (left, right) =>
            right.handoffRate - left.handoffRate ||
            right.totalExecutions - left.totalExecutions,
        )
        .slice(0, MAX_OPERATIONAL_HIGHLIGHTS),
      knownGaps: [
        "Safe automatic resolution only counts explicit terminal outcomes persisted by automation; waiting-for-input conversations stay outside this metric on purpose.",
        "Impact on no-show, occupancy and conversion is still indirect; causality between agent execution and business KPI is not modeled yet.",
      ],
    };
  }

  private extractAgentSteps(
    metadata: Prisma.JsonValue | null,
  ): Array<{
    skillName: string;
    status: "SUCCESS" | "FAILED";
  }> {
    if (!metadata || Array.isArray(metadata) || typeof metadata !== "object") {
      return [];
    }

    const steps = (metadata as Record<string, unknown>).steps;

    if (!Array.isArray(steps)) {
      return [];
    }

    return steps.flatMap((step) => {
      if (!step || Array.isArray(step) || typeof step !== "object") {
        return [];
      }

      const skillName = (step as Record<string, unknown>).skillName;
      const status = (step as Record<string, unknown>).status;

      if (
        typeof skillName !== "string" ||
        (status !== "SUCCESS" && status !== "FAILED")
      ) {
        return [];
      }

      return [
        {
          skillName,
          status,
        },
      ];
    });
  }

  private buildNoShowAggregate(
    records: TenantOperationalSnapshotRecord[],
    activeTenantCount: number,
  ): PlatformDashboardOperationsCommandCenter["noShowRate"] {
    const availableRecords = records.filter(
      (record) => record.snapshot.kpis.noShowRate.available,
    );
    const numerator = availableRecords.reduce(
      (total, record) => total + record.snapshot.kpis.noShowRate.noShowAppointments,
      0,
    );
    const denominator = availableRecords.reduce(
      (total, record) =>
        total +
        record.snapshot.kpis.noShowRate.attendanceOutcomeAppointments,
      0,
    );
    const methodology =
      availableRecords[0]?.snapshot.kpis.noShowRate.methodology ??
      "no_show / appointments_with_attendance_outcome_in_window; excludes canceled and still-pending bookings.";

    return {
      available: denominator > 0,
      methodology,
      unavailableReason:
        denominator > 0
          ? null
          : this.buildAggregateUnavailableReason(
              activeTenantCount,
              "No active tenant produced attendance outcomes in the selected window.",
            ),
      weightedAverageRate:
        denominator > 0 ? this.toPercentage(numerator, denominator) : null,
      numerator,
      denominator,
      tenantCoverage: this.buildTenantCoverage(
        activeTenantCount,
        availableRecords.length,
      ),
      highestRateTenants: availableRecords
        .map((record) => ({
          tenantId: record.tenant.id,
          tenantName: record.tenant.name,
          timezone: record.tenant.timezone,
          value: record.snapshot.kpis.noShowRate.rate ?? 0,
          sampleSize:
            record.snapshot.kpis.noShowRate.attendanceOutcomeAppointments,
        }))
        .sort(
          (left, right) =>
            right.value - left.value || right.sampleSize - left.sampleSize,
        )
        .slice(0, MAX_OPERATIONAL_HIGHLIGHTS),
    };
  }

  private buildFirstResponseAggregate(
    records: TenantOperationalSnapshotRecord[],
    activeTenantCount: number,
  ): PlatformDashboardOperationsCommandCenter["firstResponseTime"] {
    const availableRecords = records.filter(
      (record) => record.snapshot.kpis.firstResponseTime.available,
    );
    const sampleCount = availableRecords.reduce(
      (total, record) =>
        total +
        record.snapshot.kpis.firstResponseTime.respondedConversationWindows,
      0,
    );
    const totalWeightedMinutes = availableRecords.reduce((total, record) => {
      const averageMinutes =
        record.snapshot.kpis.firstResponseTime.averageMinutes ?? 0;
      const sampleSize =
        record.snapshot.kpis.firstResponseTime.respondedConversationWindows;
      return total + averageMinutes * sampleSize;
    }, 0);
    const methodology =
      availableRecords[0]?.snapshot.kpis.firstResponseTime.methodology ??
      "first outbound message after each inbound conversation window on the same thread.";

    return {
      available: sampleCount > 0,
      methodology,
      unavailableReason:
        sampleCount > 0
          ? null
          : this.buildAggregateUnavailableReason(
              activeTenantCount,
              "No active tenant produced inbound conversations with a persisted outbound response in the selected window.",
            ),
      averageMinutes:
        sampleCount > 0
          ? this.roundToOneDecimal(totalWeightedMinutes / sampleCount)
          : null,
      sampleCount,
      pendingCount: availableRecords.reduce(
        (total, record) =>
          total +
          record.snapshot.kpis.firstResponseTime.pendingConversationWindows,
        0,
      ),
      tenantCoverage: this.buildTenantCoverage(
        activeTenantCount,
        availableRecords.length,
      ),
      sourceMix: {
        agent: availableRecords.reduce(
          (total, record) =>
            total + record.snapshot.kpis.firstResponseTime.agentFirstResponses,
          0,
        ),
        human: availableRecords.reduce(
          (total, record) =>
            total + record.snapshot.kpis.firstResponseTime.humanFirstResponses,
          0,
        ),
        unknown: availableRecords.reduce(
          (total, record) =>
            total + record.snapshot.kpis.firstResponseTime.unknownFirstResponses,
          0,
        ),
      },
      slowestTenants: availableRecords
        .map((record) => ({
          tenantId: record.tenant.id,
          tenantName: record.tenant.name,
          timezone: record.tenant.timezone,
          value: record.snapshot.kpis.firstResponseTime.averageMinutes ?? 0,
          sampleSize:
            record.snapshot.kpis.firstResponseTime.respondedConversationWindows,
        }))
        .sort(
          (left, right) =>
            right.value - left.value || right.sampleSize - left.sampleSize,
        )
        .slice(0, MAX_OPERATIONAL_HIGHLIGHTS),
    };
  }

  private buildConfirmationOrRescheduleAggregate(
    records: TenantOperationalSnapshotRecord[],
    activeTenantCount: number,
  ): PlatformDashboardOperationsCommandCenter["confirmationOrRescheduleTime"] {
    const availableRecords = records.filter(
      (record) => record.snapshot.kpis.confirmationOrRescheduleTime.available,
    );
    const sampleCount = availableRecords.reduce(
      (total, record) =>
        total +
        record.snapshot.kpis.confirmationOrRescheduleTime.resolvedAppointments,
      0,
    );
    const totalWeightedMinutes = availableRecords.reduce((total, record) => {
      const averageMinutes =
        record.snapshot.kpis.confirmationOrRescheduleTime.averageMinutes ?? 0;
      const sampleSize =
        record.snapshot.kpis.confirmationOrRescheduleTime.resolvedAppointments;
      return total + averageMinutes * sampleSize;
    }, 0);
    const methodology =
      availableRecords[0]?.snapshot.kpis.confirmationOrRescheduleTime
        .methodology ??
      "first confirmed or rescheduled event after appointment creation for appointments created in the selected window.";

    return {
      available: sampleCount > 0,
      methodology,
      unavailableReason:
        sampleCount > 0
          ? null
          : this.buildAggregateUnavailableReason(
              activeTenantCount,
              "No active tenant resolved newly created appointments through confirmation or rescheduling in the selected window.",
            ),
      averageMinutes:
        sampleCount > 0
          ? this.roundToOneDecimal(totalWeightedMinutes / sampleCount)
          : null,
      sampleCount,
      pendingCount: availableRecords.reduce(
        (total, record) =>
          total +
          record.snapshot.kpis.confirmationOrRescheduleTime.pendingAppointments,
        0,
      ),
      tenantCoverage: this.buildTenantCoverage(
        activeTenantCount,
        availableRecords.length,
      ),
      slowestTenants: availableRecords
        .map((record) => ({
          tenantId: record.tenant.id,
          tenantName: record.tenant.name,
          timezone: record.tenant.timezone,
          value:
            record.snapshot.kpis.confirmationOrRescheduleTime.averageMinutes ?? 0,
          sampleSize:
            record.snapshot.kpis.confirmationOrRescheduleTime
              .resolvedAppointments,
        }))
        .sort(
          (left, right) =>
            right.value - left.value || right.sampleSize - left.sampleSize,
        )
        .slice(0, MAX_OPERATIONAL_HIGHLIGHTS),
    };
  }

  private buildAgendaOccupancyAggregate(
    records: TenantOperationalSnapshotRecord[],
    activeTenantCount: number,
  ): PlatformDashboardOperationsCommandCenter["agendaOccupancyRate"] {
    const availableRecords = records.filter(
      (record) => record.snapshot.kpis.agendaOccupancyRate.available,
    );
    const bookedMinutes = availableRecords.reduce(
      (total, record) =>
        total + record.snapshot.kpis.agendaOccupancyRate.bookedMinutes,
      0,
    );
    const availableMinutes = availableRecords.reduce(
      (total, record) =>
        total + record.snapshot.kpis.agendaOccupancyRate.availableMinutes,
      0,
    );
    const blockedMinutes = availableRecords.reduce(
      (total, record) =>
        total + record.snapshot.kpis.agendaOccupancyRate.blockedMinutes,
      0,
    );
    const methodology =
      availableRecords[0]?.snapshot.kpis.agendaOccupancyRate.methodology ??
      "booked appointment minutes over net schedule capacity minutes (active schedules minus active blocks) in the selected window.";

    return {
      available: availableMinutes > 0,
      methodology,
      unavailableReason:
        availableMinutes > 0
          ? null
          : this.buildAggregateUnavailableReason(
              activeTenantCount,
              "No active tenant exposed net schedule capacity in the selected window.",
            ),
      weightedAverageRate:
        availableMinutes > 0
          ? this.toPercentage(bookedMinutes, availableMinutes)
          : null,
      bookedMinutes,
      availableMinutes,
      blockedMinutes,
      tenantCoverage: this.buildTenantCoverage(
        activeTenantCount,
        availableRecords.length,
      ),
      lowestOccupancyTenants: availableRecords
        .map((record) => ({
          tenantId: record.tenant.id,
          tenantName: record.tenant.name,
          timezone: record.tenant.timezone,
          value: record.snapshot.kpis.agendaOccupancyRate.rate ?? 0,
          sampleSize: record.snapshot.kpis.agendaOccupancyRate.availableMinutes,
        }))
        .sort(
          (left, right) =>
            left.value - right.value || right.sampleSize - left.sampleSize,
        )
        .slice(0, MAX_OPERATIONAL_HIGHLIGHTS),
    };
  }

  private buildHandoffVolumeAggregate(
    records: TenantOperationalSnapshotRecord[],
    activeTenantCount: number,
  ): PlatformDashboardOperationsCommandCenter["handoffVolume"] {
    const availableRecords = records.filter(
      (record) => record.snapshot.kpis.handoffVolume.available,
    );
    const methodology =
      availableRecords[0]?.snapshot.kpis.handoffVolume.methodology ??
      "handoff requests opened in the selected window, segmented by source and closure status.";

    return {
      available: availableRecords.length > 0,
      methodology,
      unavailableReason: this.buildAggregateUnavailableReason(
        activeTenantCount,
        "No active tenant snapshots were available for handoff aggregation.",
        availableRecords.length > 0,
      ),
      total: availableRecords.reduce(
        (total, record) => total + record.snapshot.kpis.handoffVolume.total,
        0,
      ),
      automatic: availableRecords.reduce(
        (total, record) =>
          total + record.snapshot.kpis.handoffVolume.automatic,
        0,
      ),
      manual: availableRecords.reduce(
        (total, record) => total + record.snapshot.kpis.handoffVolume.manual,
        0,
      ),
      closed: availableRecords.reduce(
        (total, record) => total + record.snapshot.kpis.handoffVolume.closed,
        0,
      ),
      tenantCoverage: this.buildTenantCoverage(
        activeTenantCount,
        availableRecords.length,
      ),
      highestVolumeTenants: availableRecords
        .map((record) => ({
          tenantId: record.tenant.id,
          tenantName: record.tenant.name,
          timezone: record.tenant.timezone,
          total: record.snapshot.kpis.handoffVolume.total,
          automatic: record.snapshot.kpis.handoffVolume.automatic,
          manual: record.snapshot.kpis.handoffVolume.manual,
          closed: record.snapshot.kpis.handoffVolume.closed,
        }))
        .sort(
          (left, right) =>
            right.total - left.total || right.closed - left.closed,
        )
        .slice(0, MAX_OPERATIONAL_HIGHLIGHTS),
    };
  }

  private buildResolvedWithoutHumanInterventionAggregate(
    records: TenantOperationalSnapshotRecord[],
    activeTenantCount: number,
  ): PlatformDashboardOperationsCommandCenter["resolvedWithoutHumanIntervention"] {
    const availableRecords = records.filter(
      (record) =>
        record.snapshot.kpis.resolvedWithoutHumanIntervention.available,
    );
    const methodology =
      availableRecords[0]?.snapshot.kpis.resolvedWithoutHumanIntervention
        .methodology ??
      "count of explicit message-thread resolution facts with actorType=AUTOMATION in the selected window.";

    return {
      available: availableRecords.length > 0,
      methodology,
      unavailableReason: this.buildAggregateUnavailableReason(
        activeTenantCount,
        "No active tenant snapshots were available for automatic-resolution aggregation.",
        availableRecords.length > 0,
      ),
      total: availableRecords.reduce(
        (total, record) =>
          total +
          (record.snapshot.kpis.resolvedWithoutHumanIntervention.total ?? 0),
        0,
      ),
      tenantCoverage: this.buildTenantCoverage(
        activeTenantCount,
        availableRecords.length,
      ),
      highestVolumeTenants: availableRecords
        .map((record) => ({
          tenantId: record.tenant.id,
          tenantName: record.tenant.name,
          timezone: record.tenant.timezone,
          total:
            record.snapshot.kpis.resolvedWithoutHumanIntervention.total ?? 0,
        }))
        .sort((left, right) => right.total - left.total)
        .slice(0, MAX_OPERATIONAL_HIGHLIGHTS),
    };
  }

  private buildTenantCoverage(active: number, available: number) {
    return {
      active,
      available,
      unavailable: Math.max(0, active - available),
    };
  }

  private buildAggregateUnavailableReason(
    activeTenantCount: number,
    fallbackReason: string,
    isAvailable = false,
  ): string | null {
    if (isAvailable) {
      return null;
    }

    if (activeTenantCount === 0) {
      return "No active tenants are currently eligible for command center aggregation.";
    }

    return fallbackReason;
  }

  private loadTenantRecords() {
    return this.prisma.tenant.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        clinic: {
          select: {
            id: true,
          },
        },
        subscriptions: {
          orderBy: { startsAt: "desc" },
          take: 1,
          include: {
            plan: {
              select: {
                id: true,
                code: true,
                name: true,
                priceCents: true,
                currency: true,
              },
            },
          },
        },
        _count: {
          select: {
            userRoles: true,
            units: true,
            professionals: true,
            consultationTypes: true,
            patients: true,
            appointments: true,
          },
        },
      },
    });
  }

  private mapTenantSnapshot(
    tenant: TenantDashboardRecord,
  ): PlatformDashboardTenantSnapshot {
    const latestSubscription = tenant.subscriptions[0] ?? null;
    const hasCurrentSubscription =
      latestSubscription !== null &&
      SUBSCRIPTION_OPEN_STATUSES.includes(latestSubscription.status);

    return {
      id: tenant.id,
      slug: tenant.slug,
      name: tenant.name,
      timezone: tenant.timezone,
      status: tenant.status,
      createdAt: tenant.createdAt.toISOString(),
      updatedAt: tenant.updatedAt.toISOString(),
      currentPlan: latestSubscription
        ? {
            id: latestSubscription.plan.id,
            code: latestSubscription.plan.code,
            name: latestSubscription.plan.name,
            status: latestSubscription.status,
            priceCents: latestSubscription.plan.priceCents,
            currency: latestSubscription.plan.currency,
            startsAt: latestSubscription.startsAt.toISOString(),
            endsAt: latestSubscription.endsAt?.toISOString() ?? null,
          }
        : null,
      metrics: {
        operators: tenant._count.userRoles,
        units: tenant._count.units,
        professionals: tenant._count.professionals,
        consultationTypes: tenant._count.consultationTypes,
        patients: tenant._count.patients,
        appointments: tenant._count.appointments,
      },
      readiness: {
        hasClinicProfile: tenant.clinic !== null,
        hasOperators: tenant._count.userRoles > 0,
        hasScheduleBase:
          tenant._count.units > 0 &&
          tenant._count.professionals > 0 &&
          tenant._count.consultationTypes > 0,
        hasPatients: tenant._count.patients > 0,
        hasAppointments:
          hasCurrentSubscription && tenant._count.appointments > 0,
      },
    };
  }

  private resolveTenantAttentionScore(
    tenant: PlatformDashboardTenantSnapshot,
  ): number {
    let score = 0;

    if (tenant.status === TenantStatus.SUSPENDED) {
      score += 4;
    } else if (tenant.status === TenantStatus.INACTIVE) {
      score += 2;
    }

    if (tenant.currentPlan?.status === SubscriptionStatus.PAST_DUE) {
      score += 4;
    }

    if (!tenant.readiness.hasClinicProfile) {
      score += 3;
    }

    if (!tenant.readiness.hasOperators) {
      score += 2;
    }

    if (!tenant.readiness.hasScheduleBase) {
      score += 3;
    }

    if (!tenant.readiness.hasPatients) {
      score += 1;
    }

    if (!tenant.readiness.hasAppointments) {
      score += 1;
    }

    return score;
  }

  private resolveHealthLevel(input: {
    suspendedTenants: number;
    pastDueTenants: number;
    staleActiveSlotHolds: number;
    missingSetup: number;
  }): PlatformHealthLevel {
    if (
      input.staleActiveSlotHolds > 0 ||
      input.pastDueTenants >= 3 ||
      input.suspendedTenants > 0
    ) {
      return "CRITICAL";
    }

    if (input.missingSetup > 0 || input.pastDueTenants > 0) {
      return "ATTENTION";
    }

    return "HEALTHY";
  }

  private buildSummary(input: {
    healthLevel: PlatformHealthLevel;
    staleActiveSlotHolds: number;
    pastDueTenants: number;
    suspendedTenants: number;
    missingSetup: number;
  }): string {
    if (input.healthLevel === "CRITICAL") {
      const signals = [
        input.staleActiveSlotHolds > 0
          ? `${input.staleActiveSlotHolds} stale holds`
          : null,
        input.pastDueTenants > 0
          ? `${input.pastDueTenants} tenants em atraso`
          : null,
        input.suspendedTenants > 0
          ? `${input.suspendedTenants} tenants suspensos`
          : null,
      ].filter((value): value is string => value !== null);

      return `${signals.join(", ")} exigem acao imediata.`;
    }

    if (input.healthLevel === "ATTENTION") {
      return `${input.missingSetup} tenants ainda nao concluiram setup operacional ou comercial.`;
    }

    return "Base operacional consistente, sem sinais imediatos de risco no scheduling ou na carteira ativa.";
  }

  private toPercentage(value: number, total: number): number {
    if (total <= 0) {
      return 0;
    }

    return this.roundToOneDecimal((value / total) * 100);
  }

  private roundToOneDecimal(value: number): number {
    return Number(value.toFixed(1));
  }
}
