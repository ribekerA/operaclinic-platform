import { SubscriptionStatus, TenantStatus } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PlatformDashboardService } from "../../src/modules/platform/platform-dashboard.service";

describe("PlatformDashboardService", () => {
  const healthService = {
    getReadiness: vi.fn(),
  };
  const clinicOperationalKpisService = {
    getOperationalKpisForTenant: vi.fn(),
  };
  const prisma = {
    tenant: {
      findMany: vi.fn(),
    },
    user: {
      count: vi.fn(),
    },
    patient: {
      count: vi.fn(),
    },
    professional: {
      count: vi.fn(),
    },
    unit: {
      count: vi.fn(),
    },
    appointment: {
      count: vi.fn(),
    },
    appointmentStatusHistory: {
      count: vi.fn(),
    },
    slotHold: {
      count: vi.fn(),
    },
    auditLog: {
      findMany: vi.fn(),
    },
    agentExecution: {
      findMany: vi.fn(),
    },
    messageThreadResolution: {
      findMany: vi.fn(),
    },
  };

  beforeEach(() => {
    healthService.getReadiness.mockReset();
    healthService.getReadiness.mockResolvedValue({
      status: "ok",
      service: "OperaClinic API",
      environment: "test",
      timestamp: new Date().toISOString(),
      checks: {
        database: { status: "ok", issues: [], latencyMs: 12 },
        operations: {
          status: "ok",
          issues: [],
          metricsWindowMinutes: 60,
          metrics: {
            totalRequests: 0,
            failedRequests: 0,
            successRate: 1,
            avgLatencyMs: 0,
            p95LatencyMs: 0,
            perFlow: {},
          },
        },
        payment: {
          status: "ok",
          issues: [],
          provider: "stripe",
          mockCheckoutEnabled: false,
          webhookConfigured: true,
        },
        messaging: {
          status: "ok",
          issues: [],
          metaEnabled: true,
          activeMetaConnections: 1,
          activeMetaConnectionsMissingPhoneNumberId: 0,
        },
        agent: {
          status: "ok",
          issues: [],
          enabled: true,
          rolloutPercentage: 100,
          metricsWindowMinutes: 15,
          failureRateAlertThreshold: 0.05,
          p95LatencyAlertMs: 1500,
          metrics: {
            windowMinutes: 15,
            totalExecutions: 0,
            successExecutions: 0,
            failedExecutions: 0,
            failureRate: 0,
            avgDurationMs: 0,
            p95DurationMs: 0,
            perSkill: {},
          },
        },
      },
    });
    clinicOperationalKpisService.getOperationalKpisForTenant.mockReset();
    prisma.tenant.findMany.mockReset();
    prisma.user.count.mockReset();
    prisma.patient.count.mockReset();
    prisma.professional.count.mockReset();
    prisma.unit.count.mockReset();
    prisma.appointment.count.mockReset();
    prisma.appointmentStatusHistory.count.mockReset();
    prisma.slotHold.count.mockReset();
    prisma.auditLog.findMany.mockReset();
    prisma.agentExecution.findMany.mockReset();
    prisma.messageThreadResolution.findMany.mockReset();
  });

  it("aggregates readiness, subscription risk and operational health for the control plane", async () => {
    prisma.tenant.findMany.mockResolvedValue([
      {
        id: "tenant-1",
        slug: "clinica-alpha",
        name: "Clinica Alpha",
        timezone: "America/Sao_Paulo",
        status: TenantStatus.ACTIVE,
        createdAt: new Date("2026-03-10T09:00:00.000Z"),
        updatedAt: new Date("2026-03-13T08:00:00.000Z"),
        clinic: { id: "clinic-1" },
        subscriptions: [
          {
            status: SubscriptionStatus.ACTIVE,
            startsAt: new Date("2026-03-01T00:00:00.000Z"),
            endsAt: null,
            plan: {
              id: "plan-paid",
              code: "GROWTH",
              name: "Growth",
              priceCents: 19900,
              currency: "BRL",
            },
          },
        ],
        _count: {
          userRoles: 3,
          units: 2,
          professionals: 4,
          consultationTypes: 5,
          patients: 60,
          appointments: 42,
        },
      },
      {
        id: "tenant-2",
        slug: "clinica-beta",
        name: "Clinica Beta",
        timezone: "America/Sao_Paulo",
        status: TenantStatus.SUSPENDED,
        createdAt: new Date("2026-03-11T09:00:00.000Z"),
        updatedAt: new Date("2026-03-13T07:00:00.000Z"),
        clinic: null,
        subscriptions: [
          {
            status: SubscriptionStatus.PAST_DUE,
            startsAt: new Date("2026-03-05T00:00:00.000Z"),
            endsAt: null,
            plan: {
              id: "plan-plus",
              code: "PLUS",
              name: "Plus",
              priceCents: 29900,
              currency: "BRL",
            },
          },
        ],
        _count: {
          userRoles: 0,
          units: 0,
          professionals: 0,
          consultationTypes: 0,
          patients: 0,
          appointments: 0,
        },
      },
    ]);

    prisma.user.count
      .mockResolvedValueOnce(14)
      .mockResolvedValueOnce(10)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(8)
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(4);

    prisma.patient.count.mockResolvedValue(60);
    prisma.professional.count.mockResolvedValue(4);
    prisma.unit.count.mockResolvedValue(2);

    prisma.appointment.count
      .mockResolvedValueOnce(18)
      .mockResolvedValueOnce(7);

    prisma.appointmentStatusHistory.count
      .mockResolvedValueOnce(11)
      .mockResolvedValueOnce(5)
      .mockResolvedValueOnce(2);

    prisma.slotHold.count
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(1);

    prisma.auditLog.findMany.mockResolvedValue([
      {
        id: "audit-1",
        action: "APPOINTMENT_CREATED",
        actorProfile: "clinic",
        tenantId: "tenant-1",
        targetType: "appointment",
        targetId: "appt-1",
        createdAt: new Date("2026-03-13T09:15:00.000Z"),
        actorUser: {
          fullName: "Ana Recepcao",
          email: "ana@alpha.com",
        },
        tenant: {
          id: "tenant-1",
          name: "Clinica Alpha",
        },
      },
    ]);
    prisma.agentExecution.findMany.mockResolvedValue([
      {
        tenantId: "tenant-1",
        threadId: "thread-1",
        correlationId: "corr-1",
        agent: "CAPTACAO",
        status: "WAITING_FOR_INPUT",
        durationMs: 420,
        skillCalls: 2,
        failedSkillCalls: 0,
        metadata: {
          steps: [
            {
              skillName: "find_or_merge_patient",
              status: "SUCCESS",
            },
            {
              skillName: "send_message",
              status: "SUCCESS",
            },
          ],
        },
      },
      {
        tenantId: "tenant-1",
        threadId: "thread-2",
        correlationId: "corr-2",
        agent: "AGENDAMENTO",
        status: "COMPLETED",
        durationMs: 610,
        skillCalls: 2,
        failedSkillCalls: 0,
        metadata: {
          steps: [
            {
              skillName: "search_availability",
              status: "SUCCESS",
            },
            {
              skillName: "create_appointment",
              status: "SUCCESS",
            },
          ],
        },
      },
    ]);
    prisma.messageThreadResolution.findMany.mockResolvedValue([
      {
        tenantId: "tenant-1",
        actorType: "AUTOMATION",
        correlationId: "corr-2",
        agentExecutionId: "exec-2",
      },
    ]);

    clinicOperationalKpisService.getOperationalKpisForTenant.mockResolvedValue({
      generatedAt: "2026-03-13T10:00:00.000Z",
      tenantId: "tenant-1",
      timezone: "America/Sao_Paulo",
      periodDays: 30,
      range: {
        startsAt: "2026-02-12T03:00:00.000Z",
        endsAt: "2026-03-13T10:00:00.000Z",
      },
      kpis: {
        noShowRate: {
          available: true,
          methodology: "no_show / attendance_outcomes",
          unavailableReason: null,
          rate: 12.5,
          noShowAppointments: 3,
          attendanceOutcomeAppointments: 24,
        },
        firstResponseTime: {
          available: true,
          methodology: "first outbound after inbound",
          unavailableReason: null,
          averageMinutes: 8.2,
          respondedConversationWindows: 11,
          pendingConversationWindows: 2,
          agentFirstResponses: 4,
          humanFirstResponses: 6,
          unknownFirstResponses: 1,
        },
        confirmationOrRescheduleTime: {
          available: true,
          methodology: "first confirmation or reschedule after creation",
          unavailableReason: null,
          averageMinutes: 91.4,
          resolvedAppointments: 10,
          confirmedAppointments: 8,
          rescheduledAppointments: 2,
          pendingAppointments: 3,
        },
        agendaOccupancyRate: {
          available: true,
          methodology: "booked / net capacity",
          unavailableReason: null,
          rate: 68.4,
          bookedMinutes: 1230,
          availableMinutes: 1798,
          blockedMinutes: 120,
        },
        onboardingActivationTime: {
          available: true,
          methodology: "onboarding completed",
          unavailableReason: null,
          onboardingId: "onboarding-1",
          onboardingStatus: "ONBOARDING_COMPLETED",
          initiatedAt: "2026-03-01T00:00:00.000Z",
          checkoutConfirmedAt: "2026-03-01T04:00:00.000Z",
          activationStartedAt: "2026-03-02T09:00:00.000Z",
          activatedAt: "2026-03-04T18:00:00.000Z",
          totalHours: 90,
          paymentLeadTimeHours: 4,
          checkoutToActivationHours: 86,
        },
        handoffVolume: {
          available: true,
          methodology: "handoffs opened in window",
          unavailableReason: null,
          total: 7,
          automatic: 5,
          manual: 2,
          closed: 6,
        },
        resolvedWithoutHumanIntervention: {
          available: true,
          methodology: "count of explicit automatic thread outcomes",
          unavailableReason: null,
          total: 1,
        },
      },
    });

    const service = new PlatformDashboardService(
      prisma as never,
      healthService as never,
      clinicOperationalKpisService as never,
    );

    const result = await service.getDashboard();

    expect(result.overview.healthLevel).toBe("CRITICAL");
    expect(result.tenants.total).toBe(2);
    expect(result.tenants.readyForOperation).toBe(1);
    expect(result.tenants.withoutClinicProfile).toBe(1);
    expect(result.tenants.withoutOperators).toBe(1);
    expect(result.subscriptions.active).toBe(1);
    expect(result.subscriptions.pastDue).toBe(1);
    expect(result.subscriptions.revenueByCurrency).toEqual([
      {
        currency: "BRL",
        contractedMrrCents: 19900,
        pastDueExposureCents: 29900,
        trialPipelineCents: 0,
      },
    ]);
    expect(result.subscriptions.planMix[0]).toEqual(
      expect.objectContaining({
        code: "GROWTH",
        tenantCount: 1,
        contractedMrrCents: 19900,
      }),
    );
    expect(result.operations).toEqual(
      expect.objectContaining({
        appointmentsNext24Hours: 18,
        pendingConfirmationNext24Hours: 7,
        checkInsLast24Hours: 11,
        canceledLast30Days: 5,
        noShowsLast30Days: 2,
        activeSlotHolds: 3,
        staleActiveSlotHolds: 1,
      }),
    );
    expect(result.operations.commandCenter).toEqual(
      expect.objectContaining({
        periodDays: 30,
        scope: expect.objectContaining({
          activeTenants: 1,
          inactiveOrSuspendedTenants: 1,
        }),
        noShowRate: expect.objectContaining({
          available: true,
          weightedAverageRate: 12.5,
          numerator: 3,
          denominator: 24,
        }),
        firstResponseTime: expect.objectContaining({
          available: true,
          averageMinutes: 8.2,
          sampleCount: 11,
        }),
        confirmationOrRescheduleTime: expect.objectContaining({
          averageMinutes: 91.4,
          sampleCount: 10,
        }),
        agendaOccupancyRate: expect.objectContaining({
          weightedAverageRate: 68.4,
          bookedMinutes: 1230,
          availableMinutes: 1798,
        }),
        handoffVolume: expect.objectContaining({
          total: 7,
          automatic: 5,
          manual: 2,
          closed: 6,
        }),
        resolvedWithoutHumanIntervention: expect.objectContaining({
          available: true,
          total: 1,
        }),
      }),
    );
    expect(result.agents).toEqual(
      expect.objectContaining({
        readiness: expect.objectContaining({
          enabled: true,
          rolloutPercentage: 100,
          totalExecutions: 0,
        }),
        commandCenter: expect.objectContaining({
          available: true,
          totalExecutions: 2,
          uniqueThreads: 2,
          handoffOpened: 0,
          safeAutomaticResolutions: 1,
          safeResolutionRate: 100,
          handoffRate: 0,
          failureRate: 0,
          agentMix: {
            captacao: 1,
            agendamento: 1,
          },
        }),
      }),
    );
    expect(result.recentActivity[0]).toEqual(
      expect.objectContaining({
        action: "APPOINTMENT_CREATED",
        actorName: "Ana Recepcao",
        tenantName: "Clinica Alpha",
      }),
    );
    expect(result.tenants.attention[0]).toEqual(
      expect.objectContaining({
        id: "tenant-2",
        status: TenantStatus.SUSPENDED,
      }),
    );
    expect(
      clinicOperationalKpisService.getOperationalKpisForTenant,
    ).toHaveBeenCalledWith("tenant-1", { periodDays: "30" });
  });
});
