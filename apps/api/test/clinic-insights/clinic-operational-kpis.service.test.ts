import { AppointmentStatus, HandoffSource, HandoffStatus, MessageEventType, ScheduleDayOfWeek } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ClinicOperationalKpisService } from "../../src/modules/clinic-insights/clinic-operational-kpis.service";
import { buildClinicActor } from "../helpers/actors";

function buildDayContext(date: string) {
  const dateValue = new Date(`${date}T00:00:00.000Z`);
  const weekdayMap: ScheduleDayOfWeek[] = [
    ScheduleDayOfWeek.SUNDAY,
    ScheduleDayOfWeek.MONDAY,
    ScheduleDayOfWeek.TUESDAY,
    ScheduleDayOfWeek.WEDNESDAY,
    ScheduleDayOfWeek.THURSDAY,
    ScheduleDayOfWeek.FRIDAY,
    ScheduleDayOfWeek.SATURDAY,
  ];

  return {
    timezone: "America/Sao_Paulo",
    date,
    dateValue,
    weekday: weekdayMap[dateValue.getUTCDay()],
    dayStartUtc: dateValue,
    dayEndUtcInclusive: new Date(dateValue.getTime() + 86399999),
    dayEndUtcExclusive: new Date(dateValue.getTime() + 86400000),
  };
}

function combineUtcDateAndTime(date: string, time: Date): Date {
  const hours = String(time.getUTCHours()).padStart(2, "0");
  const minutes = String(time.getUTCMinutes()).padStart(2, "0");
  const seconds = String(time.getUTCSeconds()).padStart(2, "0");

  return new Date(`${date}T${hours}:${minutes}:${seconds}.000Z`);
}

describe("ClinicOperationalKpisService", () => {
  const prisma = {
    appointment: {
      findMany: vi.fn(),
    },
    messageEvent: {
      findMany: vi.fn(),
    },
    messageThreadResolution: {
      findMany: vi.fn(),
    },
    handoffRequest: {
      findMany: vi.fn(),
    },
    commercialOnboarding: {
      findFirst: vi.fn(),
    },
    professionalSchedule: {
      findMany: vi.fn(),
    },
    scheduleBlock: {
      findMany: vi.fn(),
    },
  };
  const accessService = {
    resolveActiveTenantId: vi.fn(),
  };
  const timezoneService = {
    getCurrentInstant: vi.fn(),
    getTenantTimezone: vi.fn(),
    getTenantDateKey: vi.fn(),
    buildDayContext: vi.fn(),
    combineDateAndTime: vi.fn(),
  };

  beforeEach(() => {
    prisma.appointment.findMany.mockReset();
    prisma.messageEvent.findMany.mockReset();
    prisma.messageThreadResolution.findMany.mockReset();
    prisma.handoffRequest.findMany.mockReset();
    prisma.commercialOnboarding.findFirst.mockReset();
    prisma.professionalSchedule.findMany.mockReset();
    prisma.scheduleBlock.findMany.mockReset();
    accessService.resolveActiveTenantId.mockReset();
    timezoneService.getCurrentInstant.mockReset();
    timezoneService.getTenantTimezone.mockReset();
    timezoneService.getTenantDateKey.mockReset();
    timezoneService.buildDayContext.mockReset();
    timezoneService.combineDateAndTime.mockReset();

    accessService.resolveActiveTenantId.mockReturnValue("tenant-1");
    timezoneService.getCurrentInstant.mockResolvedValue(
      new Date("2026-04-04T15:00:00.000Z"),
    );
    timezoneService.getTenantTimezone.mockResolvedValue("America/Sao_Paulo");
    timezoneService.getTenantDateKey.mockImplementation((value: Date) =>
      value.toISOString().slice(0, 10),
    );
    timezoneService.buildDayContext.mockImplementation((date: string) =>
      buildDayContext(date),
    );
    timezoneService.combineDateAndTime.mockImplementation(
      (date: string, time: Date) => combineUtcDateAndTime(date, time),
    );
  });

  it("computes tenant-scoped operational KPI snapshot from persisted traces", async () => {
    prisma.appointment.findMany
      .mockResolvedValueOnce([
        {
          status: AppointmentStatus.NO_SHOW,
          startsAt: new Date("2026-04-04T09:00:00.000Z"),
          endsAt: new Date("2026-04-04T09:30:00.000Z"),
          professionalId: "professional-1",
        },
        {
          status: AppointmentStatus.COMPLETED,
          startsAt: new Date("2026-04-04T09:30:00.000Z"),
          endsAt: new Date("2026-04-04T10:00:00.000Z"),
          professionalId: "professional-1",
        },
        {
          status: AppointmentStatus.CHECKED_IN,
          startsAt: new Date("2026-04-04T10:00:00.000Z"),
          endsAt: new Date("2026-04-04T10:30:00.000Z"),
          professionalId: "professional-1",
        },
        {
          status: AppointmentStatus.CANCELED,
          startsAt: new Date("2026-04-04T10:30:00.000Z"),
          endsAt: new Date("2026-04-04T11:00:00.000Z"),
          professionalId: "professional-1",
        },
      ])
      .mockResolvedValueOnce([
        {
          createdAt: new Date("2026-04-04T08:00:00.000Z"),
          confirmedAt: new Date("2026-04-04T08:30:00.000Z"),
          statusHistory: [
            {
              toStatus: AppointmentStatus.CONFIRMED,
              createdAt: new Date("2026-04-04T08:30:00.000Z"),
            },
          ],
        },
        {
          createdAt: new Date("2026-04-04T09:00:00.000Z"),
          confirmedAt: null,
          statusHistory: [
            {
              toStatus: AppointmentStatus.RESCHEDULED,
              createdAt: new Date("2026-04-04T11:00:00.000Z"),
            },
          ],
        },
        {
          createdAt: new Date("2026-04-04T12:00:00.000Z"),
          confirmedAt: null,
          statusHistory: [],
        },
      ]);

    prisma.messageEvent.findMany.mockResolvedValue([
      {
        threadId: "thread-1",
        eventType: MessageEventType.MESSAGE_RECEIVED,
        occurredAt: new Date("2026-04-04T10:00:00.000Z"),
        metadata: null,
      },
      {
        threadId: "thread-1",
        eventType: MessageEventType.MESSAGE_SENT,
        occurredAt: new Date("2026-04-04T10:05:00.000Z"),
        metadata: {
          source: "AGENT",
        },
      },
      {
        threadId: "thread-1",
        eventType: MessageEventType.MESSAGE_RECEIVED,
        occurredAt: new Date("2026-04-04T10:10:00.000Z"),
        metadata: null,
      },
      {
        threadId: "thread-1",
        eventType: MessageEventType.MESSAGE_SENT,
        occurredAt: new Date("2026-04-04T10:20:00.000Z"),
        metadata: {
          source: "HUMAN",
        },
      },
      {
        threadId: "thread-2",
        eventType: MessageEventType.MESSAGE_RECEIVED,
        occurredAt: new Date("2026-04-04T11:00:00.000Z"),
        metadata: null,
      },
    ]);

    prisma.handoffRequest.findMany.mockResolvedValue([
      {
        source: HandoffSource.MANUAL,
        status: HandoffStatus.CLOSED,
      },
      {
        source: HandoffSource.MANUAL,
        status: HandoffStatus.OPEN,
      },
      {
        source: HandoffSource.AUTOMATIC,
        status: HandoffStatus.ASSIGNED,
      },
    ]);

    prisma.messageThreadResolution.findMany.mockResolvedValue([
      {
        actorType: "AUTOMATION",
      },
      {
        actorType: "HUMAN",
      },
      {
        actorType: "AUTOMATION",
      },
    ]);

    prisma.commercialOnboarding.findFirst.mockResolvedValue({
      id: "onboarding-1",
      status: "ONBOARDING_COMPLETED",
      createdAt: new Date("2026-03-30T10:00:00.000Z"),
      checkoutConfirmedAt: new Date("2026-04-01T10:00:00.000Z"),
      onboardingStartedAt: new Date("2026-04-01T11:00:00.000Z"),
      onboardingCompletedAt: new Date("2026-04-02T10:00:00.000Z"),
    });

    prisma.professionalSchedule.findMany.mockResolvedValue([
      {
        professionalId: "professional-1",
        dayOfWeek: ScheduleDayOfWeek.SATURDAY,
        startTime: new Date("1970-01-01T09:00:00.000Z"),
        endTime: new Date("1970-01-01T11:00:00.000Z"),
        validFrom: null,
        validTo: null,
      },
    ]);

    prisma.scheduleBlock.findMany.mockResolvedValue([
      {
        professionalId: "professional-1",
        startsAt: new Date("2026-04-04T10:30:00.000Z"),
        endsAt: new Date("2026-04-04T11:00:00.000Z"),
      },
    ]);

    const service = new ClinicOperationalKpisService(
      prisma as never,
      accessService as never,
      timezoneService as never,
    );

    const result = await service.getOperationalKpis(buildClinicActor(), {
      periodDays: "7",
    });

    expect(result.tenantId).toBe("tenant-1");
    expect(result.kpis.noShowRate).toEqual(
      expect.objectContaining({
        available: true,
        rate: 33.3,
        noShowAppointments: 1,
        attendanceOutcomeAppointments: 3,
      }),
    );
    expect(result.kpis.firstResponseTime).toEqual(
      expect.objectContaining({
        available: true,
        averageMinutes: 7.5,
        respondedConversationWindows: 2,
        pendingConversationWindows: 1,
        agentFirstResponses: 1,
        humanFirstResponses: 1,
        unknownFirstResponses: 0,
      }),
    );
    expect(result.kpis.confirmationOrRescheduleTime).toEqual(
      expect.objectContaining({
        available: true,
        averageMinutes: 75,
        resolvedAppointments: 2,
        confirmedAppointments: 1,
        rescheduledAppointments: 1,
        pendingAppointments: 1,
      }),
    );
    expect(result.kpis.agendaOccupancyRate).toEqual(
      expect.objectContaining({
        available: true,
        rate: 100,
        bookedMinutes: 90,
        availableMinutes: 90,
        blockedMinutes: 30,
      }),
    );
    expect(result.kpis.onboardingActivationTime).toEqual(
      expect.objectContaining({
        available: true,
        onboardingId: "onboarding-1",
        totalHours: 72,
        paymentLeadTimeHours: 48,
        checkoutToActivationHours: 24,
      }),
    );
    expect(result.kpis.handoffVolume).toEqual(
      expect.objectContaining({
        total: 3,
        automatic: 1,
        manual: 2,
        closed: 1,
      }),
    );
    expect(result.kpis.resolvedWithoutHumanIntervention).toEqual(
      expect.objectContaining({
        available: true,
        total: 2,
      }),
    );
  });

  it("marks KPIs unavailable when the tenant lacks supporting operational data", async () => {
    prisma.appointment.findMany.mockResolvedValue([]);
    prisma.messageEvent.findMany.mockResolvedValue([]);
    prisma.messageThreadResolution.findMany.mockResolvedValue([]);
    prisma.handoffRequest.findMany.mockResolvedValue([]);
    prisma.commercialOnboarding.findFirst.mockResolvedValue(null);
    prisma.professionalSchedule.findMany.mockResolvedValue([]);
    prisma.scheduleBlock.findMany.mockResolvedValue([]);

    const service = new ClinicOperationalKpisService(
      prisma as never,
      accessService as never,
      timezoneService as never,
    );

    const result = await service.getOperationalKpis(buildClinicActor(), {});

    expect(result.kpis.noShowRate.available).toBe(false);
    expect(result.kpis.firstResponseTime.available).toBe(false);
    expect(result.kpis.confirmationOrRescheduleTime.available).toBe(false);
    expect(result.kpis.agendaOccupancyRate.available).toBe(false);
    expect(result.kpis.onboardingActivationTime.available).toBe(false);
    expect(result.kpis.handoffVolume).toEqual(
      expect.objectContaining({
        available: true,
        total: 0,
      }),
    );
    expect(result.kpis.resolvedWithoutHumanIntervention).toEqual(
      expect.objectContaining({
        available: true,
        total: 0,
        unavailableReason: null,
      }),
    );
  });
});
