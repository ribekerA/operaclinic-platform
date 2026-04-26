import { Injectable } from "@nestjs/common";
import type {
  AestheticClinicExecutiveDashboardQuery,
  AestheticClinicOperationalKpisResponse,
} from "@operaclinic/shared";
import {
  AppointmentStatus,
  HandoffSource,
  HandoffStatus,
  MessageEventType,
  MessageThreadResolutionActorType,
  Prisma,
} from "@prisma/client";
import { AuthenticatedUser } from "../../auth/interfaces/authenticated-user.interface";
import { PrismaService } from "../../database/prisma.service";
import { SchedulingAccessService } from "../scheduling/scheduling-access.service";
import {
  SchedulingTimezoneService,
  TenantDayContext,
} from "../scheduling/scheduling-timezone.service";

const ATTENDANCE_OUTCOME_STATUSES = new Set<AppointmentStatus>([
  AppointmentStatus.CHECKED_IN,
  AppointmentStatus.CALLED,
  AppointmentStatus.IN_PROGRESS,
  AppointmentStatus.AWAITING_CLOSURE,
  AppointmentStatus.AWAITING_PAYMENT,
  AppointmentStatus.COMPLETED,
  AppointmentStatus.NO_SHOW,
]);

interface RoiWindowContext {
  tenantId: string;
  timezone: string;
  now: Date;
  periodDays: number;
  rangeStartUtc: Date;
  rangeStartDateKey: string;
  rangeEndDateKey: string;
}

interface TimeInterval {
  start: Date;
  end: Date;
}

interface ResponseMessageEventRecord {
  threadId: string;
  eventType: MessageEventType;
  occurredAt: Date;
  metadata: Prisma.JsonValue | null;
}

@Injectable()
export class ClinicOperationalKpisService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly schedulingAccessService: SchedulingAccessService,
    private readonly timezoneService: SchedulingTimezoneService,
  ) {}

  async getOperationalKpis(
    actor: AuthenticatedUser,
    query: AestheticClinicExecutiveDashboardQuery,
  ): Promise<AestheticClinicOperationalKpisResponse> {
    const tenantId = this.schedulingAccessService.resolveActiveTenantId(actor);
    return this.getOperationalKpisForTenant(tenantId, query);
  }

  async getOperationalKpisForTenant(
    tenantId: string,
    query: AestheticClinicExecutiveDashboardQuery,
  ): Promise<AestheticClinicOperationalKpisResponse> {
    const window = await this.resolveWindow(tenantId, query);
    const startDateContext = this.timezoneService.buildDayContext(
      window.rangeStartDateKey,
      window.timezone,
    );
    const endDateContext = this.timezoneService.buildDayContext(
      window.rangeEndDateKey,
      window.timezone,
    );

    const [
      appointmentsByStartRange,
      appointmentsByCreateRange,
      messageEvents,
      threadResolutions,
      handoffRequests,
      onboarding,
      schedules,
      scheduleBlocks,
    ] = await Promise.all([
      this.prisma.appointment.findMany({
        where: {
          tenantId,
          startsAt: {
            gte: window.rangeStartUtc,
            lte: window.now,
          },
        },
        select: {
          status: true,
          startsAt: true,
          endsAt: true,
          professionalId: true,
        },
      }),
      this.prisma.appointment.findMany({
        where: {
          tenantId,
          createdAt: {
            gte: window.rangeStartUtc,
            lte: window.now,
          },
        },
        select: {
          createdAt: true,
          confirmedAt: true,
          statusHistory: {
            where: {
              toStatus: {
                in: [AppointmentStatus.CONFIRMED, AppointmentStatus.RESCHEDULED],
              },
            },
            orderBy: {
              createdAt: "asc",
            },
            select: {
              toStatus: true,
              createdAt: true,
            },
          },
        },
      }),
      this.prisma.messageEvent.findMany({
        where: {
          tenantId,
          occurredAt: {
            gte: window.rangeStartUtc,
            lte: window.now,
          },
          eventType: {
            in: [MessageEventType.MESSAGE_RECEIVED, MessageEventType.MESSAGE_SENT],
          },
        },
        orderBy: [{ threadId: "asc" }, { occurredAt: "asc" }, { createdAt: "asc" }],
        select: {
          threadId: true,
          eventType: true,
          occurredAt: true,
          metadata: true,
        },
      }),
      this.prisma.messageThreadResolution.findMany({
        where: {
          tenantId,
          occurredAt: {
            gte: window.rangeStartUtc,
            lte: window.now,
          },
        },
        select: {
          actorType: true,
        },
      }),
      this.prisma.handoffRequest.findMany({
        where: {
          tenantId,
          openedAt: {
            gte: window.rangeStartUtc,
            lte: window.now,
          },
        },
        select: {
          source: true,
          status: true,
        },
      }),
      this.prisma.commercialOnboarding.findFirst({
        where: {
          tenantId,
        },
        orderBy: [{ onboardingCompletedAt: "desc" }, { createdAt: "desc" }],
        select: {
          id: true,
          status: true,
          createdAt: true,
          checkoutConfirmedAt: true,
          onboardingStartedAt: true,
          onboardingCompletedAt: true,
        },
      }),
      this.prisma.professionalSchedule.findMany({
        where: {
          tenantId,
          isActive: true,
          AND: [
            {
              OR: [{ validFrom: null }, { validFrom: { lte: endDateContext.dateValue } }],
            },
            {
              OR: [{ validTo: null }, { validTo: { gte: startDateContext.dateValue } }],
            },
          ],
        },
        select: {
          professionalId: true,
          dayOfWeek: true,
          startTime: true,
          endTime: true,
          validFrom: true,
          validTo: true,
        },
      }),
      this.prisma.scheduleBlock.findMany({
        where: {
          tenantId,
          isActive: true,
          startsAt: {
            lt: window.now,
          },
          endsAt: {
            gt: window.rangeStartUtc,
          },
        },
        select: {
          professionalId: true,
          startsAt: true,
          endsAt: true,
        },
      }),
    ]);

    return {
      generatedAt: window.now.toISOString(),
      tenantId: window.tenantId,
      timezone: window.timezone,
      periodDays: window.periodDays,
      range: {
        startsAt: window.rangeStartUtc.toISOString(),
        endsAt: window.now.toISOString(),
      },
      kpis: {
        noShowRate: this.buildNoShowRateKpi(appointmentsByStartRange),
        firstResponseTime: this.buildFirstResponseTimeKpi(messageEvents),
        confirmationOrRescheduleTime: this.buildConfirmationOrRescheduleTimeKpi(
          appointmentsByCreateRange,
        ),
        agendaOccupancyRate: this.buildAgendaOccupancyRateKpi({
          appointments: appointmentsByStartRange,
          schedules,
          scheduleBlocks,
          window,
        }),
        onboardingActivationTime: this.buildOnboardingActivationTimeKpi(onboarding),
        handoffVolume: this.buildHandoffVolumeKpi(handoffRequests),
        resolvedWithoutHumanIntervention:
          this.buildResolvedWithoutHumanInterventionKpi(threadResolutions),
      },
    };
  }

  private async resolveWindow(
    tenantId: string,
    query: AestheticClinicExecutiveDashboardQuery,
  ): Promise<RoiWindowContext> {
    const periodDays = this.resolvePeriodDays(query.periodDays);
    const now = await this.timezoneService.getCurrentInstant();
    const timezone = await this.timezoneService.getTenantTimezone(tenantId);
    const rangeEndDateKey = this.timezoneService.getTenantDateKey(now, timezone);
    const rangeStartDateKey = this.addDaysToDateKey(rangeEndDateKey, -(periodDays - 1));
    const rangeStartUtc = this.timezoneService.buildDayContext(
      rangeStartDateKey,
      timezone,
    ).dayStartUtc;

    return {
      tenantId,
      timezone,
      now,
      periodDays,
      rangeStartUtc,
      rangeStartDateKey,
      rangeEndDateKey,
    };
  }

  private buildNoShowRateKpi(
    appointments: Array<{
      status: AppointmentStatus;
    }>,
  ): AestheticClinicOperationalKpisResponse["kpis"]["noShowRate"] {
    const attendanceOutcomeAppointments = appointments.filter((appointment) =>
      ATTENDANCE_OUTCOME_STATUSES.has(appointment.status),
    ).length;
    const noShowAppointments = appointments.filter(
      (appointment) => appointment.status === AppointmentStatus.NO_SHOW,
    ).length;

    return {
      available: attendanceOutcomeAppointments > 0,
      methodology:
        "no_show / appointments_with_attendance_outcome_in_window; excludes canceled and still-pending bookings.",
      unavailableReason:
        attendanceOutcomeAppointments > 0
          ? null
          : "No appointments with attendance outcome were found in the selected window.",
      rate:
        attendanceOutcomeAppointments > 0
          ? this.toPercentage(noShowAppointments, attendanceOutcomeAppointments)
          : null,
      noShowAppointments,
      attendanceOutcomeAppointments,
    };
  }

  private buildFirstResponseTimeKpi(
    events: ResponseMessageEventRecord[],
  ): AestheticClinicOperationalKpisResponse["kpis"]["firstResponseTime"] {
    const eventsByThread = new Map<string, ResponseMessageEventRecord[]>();

    for (const event of events) {
      const current = eventsByThread.get(event.threadId) ?? [];
      current.push(event);
      eventsByThread.set(event.threadId, current);
    }

    const responseTimesInMinutes: number[] = [];
    let pendingConversationWindows = 0;
    let agentFirstResponses = 0;
    let humanFirstResponses = 0;
    let unknownFirstResponses = 0;

    for (const threadEvents of eventsByThread.values()) {
      let pendingInboundAt: Date | null = null;

      for (const event of threadEvents) {
        if (event.eventType === MessageEventType.MESSAGE_RECEIVED) {
          pendingInboundAt ??= event.occurredAt;
          continue;
        }

        if (
          event.eventType === MessageEventType.MESSAGE_SENT &&
          pendingInboundAt !== null
        ) {
          responseTimesInMinutes.push(
            (event.occurredAt.getTime() - pendingInboundAt.getTime()) / 60000,
          );

          switch (this.resolveMessageSource(event.metadata)) {
            case "AGENT":
              agentFirstResponses += 1;
              break;
            case "HUMAN":
              humanFirstResponses += 1;
              break;
            default:
              unknownFirstResponses += 1;
              break;
          }

          pendingInboundAt = null;
        }
      }

      if (pendingInboundAt !== null) {
        pendingConversationWindows += 1;
      }
    }

    return {
      available: responseTimesInMinutes.length > 0,
      methodology:
        "first outbound message after each inbound conversation window on the same thread.",
      unavailableReason:
        responseTimesInMinutes.length > 0
          ? null
          : "No inbound conversations with a persisted outbound response were found in the selected window.",
      averageMinutes: this.averageOf(responseTimesInMinutes),
      respondedConversationWindows: responseTimesInMinutes.length,
      pendingConversationWindows,
      agentFirstResponses,
      humanFirstResponses,
      unknownFirstResponses,
    };
  }

  private buildConfirmationOrRescheduleTimeKpi(
    appointments: Array<{
      createdAt: Date;
      confirmedAt: Date | null;
      statusHistory: Array<{
        toStatus: AppointmentStatus;
        createdAt: Date;
      }>;
    }>,
  ): AestheticClinicOperationalKpisResponse["kpis"]["confirmationOrRescheduleTime"] {
    const durationsInMinutes: number[] = [];
    let resolvedAppointments = 0;
    let confirmedAppointments = 0;
    let rescheduledAppointments = 0;
    let pendingAppointments = 0;

    for (const appointment of appointments) {
      const firstTrackedResolution = appointment.statusHistory[0] ?? null;
      const resolutionEvent =
        firstTrackedResolution ??
        (appointment.confirmedAt
          ? {
              toStatus: AppointmentStatus.CONFIRMED,
              createdAt: appointment.confirmedAt,
            }
          : null);

      if (!resolutionEvent) {
        pendingAppointments += 1;
        continue;
      }

      if (resolutionEvent.createdAt.getTime() < appointment.createdAt.getTime()) {
        pendingAppointments += 1;
        continue;
      }

      durationsInMinutes.push(
        (resolutionEvent.createdAt.getTime() - appointment.createdAt.getTime()) /
          60000,
      );
      resolvedAppointments += 1;

      if (resolutionEvent.toStatus === AppointmentStatus.RESCHEDULED) {
        rescheduledAppointments += 1;
      } else {
        confirmedAppointments += 1;
      }
    }

    return {
      available: resolvedAppointments > 0,
      methodology:
        "first confirmed or rescheduled event after appointment creation for appointments created in the selected window.",
      unavailableReason:
        resolvedAppointments > 0
          ? null
          : "No appointments created in the selected window reached confirmation or rescheduling.",
      averageMinutes: this.averageOf(durationsInMinutes),
      resolvedAppointments,
      confirmedAppointments,
      rescheduledAppointments,
      pendingAppointments,
    };
  }

  private buildAgendaOccupancyRateKpi(input: {
    appointments: Array<{
      status: AppointmentStatus;
      startsAt: Date;
      endsAt: Date;
      professionalId: string;
    }>;
    schedules: Array<{
      professionalId: string;
      dayOfWeek: TenantDayContext["weekday"];
      startTime: Date;
      endTime: Date;
      validFrom: Date | null;
      validTo: Date | null;
    }>;
    scheduleBlocks: Array<{
      professionalId: string;
      startsAt: Date;
      endsAt: Date;
    }>;
    window: RoiWindowContext;
  }): AestheticClinicOperationalKpisResponse["kpis"]["agendaOccupancyRate"] {
    const dayContexts = this.buildDayContexts(
      input.window.rangeStartDateKey,
      input.window.rangeEndDateKey,
      input.window.timezone,
    );
    const scheduleIntervalsByProfessional = new Map<string, TimeInterval[]>();
    const blockIntervalsByProfessional = new Map<string, TimeInterval[]>();

    for (const schedule of input.schedules) {
      for (const dayContext of dayContexts) {
        if (schedule.dayOfWeek !== dayContext.weekday) {
          continue;
        }

        if (schedule.validFrom && schedule.validFrom.getTime() > dayContext.dateValue.getTime()) {
          continue;
        }

        if (schedule.validTo && schedule.validTo.getTime() < dayContext.dateValue.getTime()) {
          continue;
        }

        const scheduleStart = this.timezoneService.combineDateAndTime(
          dayContext.date,
          schedule.startTime,
          input.window.timezone,
        );
        const scheduleEnd = this.timezoneService.combineDateAndTime(
          dayContext.date,
          schedule.endTime,
          input.window.timezone,
        );
        const interval = this.clipInterval(
          scheduleStart,
          scheduleEnd,
          input.window.rangeStartUtc,
          input.window.now,
        );

        if (interval) {
          this.pushInterval(
            scheduleIntervalsByProfessional,
            schedule.professionalId,
            interval,
          );
        }
      }
    }

    for (const block of input.scheduleBlocks) {
      const interval = this.clipInterval(
        block.startsAt,
        block.endsAt,
        input.window.rangeStartUtc,
        input.window.now,
      );

      if (interval) {
        this.pushInterval(
          blockIntervalsByProfessional,
          block.professionalId,
          interval,
        );
      }
    }

    let availableMinutes = 0;
    let blockedMinutes = 0;

    for (const [professionalId, intervals] of scheduleIntervalsByProfessional.entries()) {
      const mergedSchedules = this.mergeIntervals(intervals);
      const mergedBlocks = this.mergeIntervals(
        blockIntervalsByProfessional.get(professionalId) ?? [],
      );
      const scheduledMinutes = this.sumIntervalMinutes(mergedSchedules);
      const scheduleBlockedMinutes = this.calculateOverlapMinutes(
        mergedSchedules,
        mergedBlocks,
      );

      availableMinutes += Math.max(0, scheduledMinutes - scheduleBlockedMinutes);
      blockedMinutes += scheduleBlockedMinutes;
    }

    const bookedMinutes = input.appointments
      .filter((appointment) => appointment.status !== AppointmentStatus.CANCELED)
      .reduce((total, appointment) => {
        const interval = this.clipInterval(
          appointment.startsAt,
          appointment.endsAt,
          input.window.rangeStartUtc,
          input.window.now,
        );

        return total + (interval ? this.diffMinutes(interval.end, interval.start) : 0);
      }, 0);

    return {
      available: availableMinutes > 0,
      methodology:
        "booked appointment minutes over net schedule capacity minutes (active schedules minus active blocks) in the selected window.",
      unavailableReason:
        availableMinutes > 0
          ? null
          : "No active schedule capacity was found in the selected window.",
      rate:
        availableMinutes > 0
          ? this.toPercentage(bookedMinutes, availableMinutes)
          : null,
      bookedMinutes,
      availableMinutes,
      blockedMinutes,
    };
  }

  private buildOnboardingActivationTimeKpi(
    onboarding: {
      id: string;
      status:
        | "INITIATED"
        | "AWAITING_PAYMENT"
        | "PAID"
        | "ONBOARDING_STARTED"
        | "ONBOARDING_COMPLETED"
        | "EXPIRED"
        | "ESCALATED_TO_STAFF";
      createdAt: Date;
      checkoutConfirmedAt: Date | null;
      onboardingStartedAt: Date | null;
      onboardingCompletedAt: Date | null;
    } | null,
  ): AestheticClinicOperationalKpisResponse["kpis"]["onboardingActivationTime"] {
    if (!onboarding) {
      return {
        available: false,
        methodology:
          "commercial onboarding lifecycle from initiated to onboarding completed for the tenant-linked onboarding record.",
        unavailableReason: "Tenant has no linked commercial onboarding record.",
        onboardingId: null,
        onboardingStatus: null,
        initiatedAt: null,
        checkoutConfirmedAt: null,
        activationStartedAt: null,
        activatedAt: null,
        totalHours: null,
        paymentLeadTimeHours: null,
        checkoutToActivationHours: null,
      };
    }

    return {
      available: onboarding.onboardingCompletedAt !== null,
      methodology:
        "commercial onboarding lifecycle from initiated to onboarding completed for the tenant-linked onboarding record.",
      unavailableReason:
        onboarding.onboardingCompletedAt !== null
          ? null
          : "Tenant onboarding is not completed yet.",
      onboardingId: onboarding.id,
      onboardingStatus: onboarding.status,
      initiatedAt: onboarding.createdAt.toISOString(),
      checkoutConfirmedAt: onboarding.checkoutConfirmedAt?.toISOString() ?? null,
      activationStartedAt: onboarding.onboardingStartedAt?.toISOString() ?? null,
      activatedAt: onboarding.onboardingCompletedAt?.toISOString() ?? null,
      totalHours: this.diffHoursOrNull(
        onboarding.onboardingCompletedAt,
        onboarding.createdAt,
      ),
      paymentLeadTimeHours: this.diffHoursOrNull(
        onboarding.checkoutConfirmedAt,
        onboarding.createdAt,
      ),
      checkoutToActivationHours: this.diffHoursOrNull(
        onboarding.onboardingCompletedAt,
        onboarding.checkoutConfirmedAt,
      ),
    };
  }

  private buildHandoffVolumeKpi(
    handoffRequests: Array<{
      source: HandoffSource;
      status: HandoffStatus;
    }>,
  ): AestheticClinicOperationalKpisResponse["kpis"]["handoffVolume"] {
    const automatic = handoffRequests.filter(
      (handoff) => handoff.source === HandoffSource.AUTOMATIC,
    ).length;
    const manual = handoffRequests.filter(
      (handoff) => handoff.source === HandoffSource.MANUAL,
    ).length;
    const closed = handoffRequests.filter(
      (handoff) => handoff.status === HandoffStatus.CLOSED,
    ).length;

    return {
      available: true,
      methodology:
        "handoff requests opened in the selected window, segmented by source and closure status.",
      unavailableReason: null,
      total: handoffRequests.length,
      automatic,
      manual,
      closed,
    };
  }

  private buildResolvedWithoutHumanInterventionKpi(
    resolutions: Array<{
      actorType: MessageThreadResolutionActorType;
    }>,
  ): AestheticClinicOperationalKpisResponse["kpis"]["resolvedWithoutHumanIntervention"] {
    const automaticResolutions = resolutions.filter(
      (resolution) =>
        resolution.actorType === MessageThreadResolutionActorType.AUTOMATION,
    ).length;

    return {
      available: true,
      methodology:
        "count of explicit message-thread resolution facts with actorType=AUTOMATION in the selected window.",
      unavailableReason: null,
      total: automaticResolutions,
    };
  }

  private resolveMessageSource(
    metadata: Prisma.JsonValue | null,
  ): "AGENT" | "HUMAN" | "UNKNOWN" {
    if (!metadata || Array.isArray(metadata) || typeof metadata !== "object") {
      return "UNKNOWN";
    }

    const source = (metadata as Record<string, unknown>).source;

    if (source === "AGENT" || source === "HUMAN") {
      return source;
    }

    return "UNKNOWN";
  }

  private buildDayContexts(
    startDateKey: string,
    endDateKey: string,
    timezone: string,
  ): TenantDayContext[] {
    const contexts: TenantDayContext[] = [];
    let cursor = startDateKey;

    while (cursor <= endDateKey) {
      contexts.push(this.timezoneService.buildDayContext(cursor, timezone));
      cursor = this.addDaysToDateKey(cursor, 1);
    }

    return contexts;
  }

  private addDaysToDateKey(dateKey: string, days: number): string {
    const [year, month, day] = dateKey.split("-").map((value) => Number.parseInt(value, 10));
    const value = new Date(Date.UTC(year, month - 1, day + days));
    return value.toISOString().slice(0, 10);
  }

  private clipInterval(
    start: Date,
    end: Date,
    windowStart: Date,
    windowEnd: Date,
  ): TimeInterval | null {
    const clippedStart = new Date(Math.max(start.getTime(), windowStart.getTime()));
    const clippedEnd = new Date(Math.min(end.getTime(), windowEnd.getTime()));

    if (clippedEnd.getTime() <= clippedStart.getTime()) {
      return null;
    }

    return {
      start: clippedStart,
      end: clippedEnd,
    };
  }

  private pushInterval(
    target: Map<string, TimeInterval[]>,
    key: string,
    interval: TimeInterval,
  ): void {
    const current = target.get(key) ?? [];
    current.push(interval);
    target.set(key, current);
  }

  private mergeIntervals(intervals: TimeInterval[]): TimeInterval[] {
    if (!intervals.length) {
      return [];
    }

    const sorted = [...intervals].sort(
      (left, right) => left.start.getTime() - right.start.getTime(),
    );
    const merged: TimeInterval[] = [sorted[0]];

    for (const interval of sorted.slice(1)) {
      const last = merged[merged.length - 1];

      if (interval.start.getTime() <= last.end.getTime()) {
        last.end = new Date(Math.max(last.end.getTime(), interval.end.getTime()));
        continue;
      }

      merged.push({
        start: new Date(interval.start),
        end: new Date(interval.end),
      });
    }

    return merged;
  }

  private calculateOverlapMinutes(
    left: TimeInterval[],
    right: TimeInterval[],
  ): number {
    let overlapMinutes = 0;
    let leftIndex = 0;
    let rightIndex = 0;

    while (leftIndex < left.length && rightIndex < right.length) {
      const leftInterval = left[leftIndex];
      const rightInterval = right[rightIndex];
      const overlapStart = Math.max(
        leftInterval.start.getTime(),
        rightInterval.start.getTime(),
      );
      const overlapEnd = Math.min(
        leftInterval.end.getTime(),
        rightInterval.end.getTime(),
      );

      if (overlapEnd > overlapStart) {
        overlapMinutes += Math.round((overlapEnd - overlapStart) / 60000);
      }

      if (leftInterval.end.getTime() <= rightInterval.end.getTime()) {
        leftIndex += 1;
      } else {
        rightIndex += 1;
      }
    }

    return overlapMinutes;
  }

  private sumIntervalMinutes(intervals: TimeInterval[]): number {
    return intervals.reduce(
      (total, interval) => total + this.diffMinutes(interval.end, interval.start),
      0,
    );
  }

  private resolvePeriodDays(rawPeriodDays?: string): number {
    const parsed = Number.parseInt(rawPeriodDays ?? "30", 10);

    if (Number.isNaN(parsed)) {
      return 30;
    }

    if (parsed < 7) {
      return 7;
    }

    if (parsed > 90) {
      return 90;
    }

    return parsed;
  }

  private diffMinutes(left: Date, right: Date): number {
    return Math.round((left.getTime() - right.getTime()) / 60000);
  }

  private diffHoursOrNull(left: Date | null, right: Date | null): number | null {
    if (!left || !right) {
      return null;
    }

    return Number(((left.getTime() - right.getTime()) / 3600000).toFixed(1));
  }

  private toPercentage(value: number, total: number): number {
    if (total <= 0) {
      return 0;
    }

    return Number(((value / total) * 100).toFixed(1));
  }

  private averageOf(values: number[]): number | null {
    if (!values.length) {
      return null;
    }

    return Number(
      (values.reduce((total, value) => total + value, 0) / values.length).toFixed(1),
    );
  }
}
