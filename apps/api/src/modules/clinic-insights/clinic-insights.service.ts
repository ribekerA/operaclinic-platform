import { Injectable } from "@nestjs/common";
import type {
  AestheticClinicDashboardAgentEscalationReason,
  AestheticClinicDashboardConsultationTypeNoShow,
  AestheticClinicDashboardTimelinePoint,
  AestheticClinicDashboardWorkloadByHour,
  AestheticClinicExecutiveDashboardQuery,
  AestheticClinicExecutiveDashboardResponse,
} from "@operaclinic/shared";
import { AppointmentStatus, SubscriptionStatus } from "@prisma/client";
import { AuthenticatedUser } from "../../auth/interfaces/authenticated-user.interface";
import { PrismaService } from "../../database/prisma.service";
import { SchedulingAccessService } from "../scheduling/scheduling-access.service";
import { SchedulingTimezoneService } from "../scheduling/scheduling-timezone.service";

interface DashboardAppointmentRecord {
  status: AppointmentStatus;
  startsAt: Date;
  checkedInAt: Date | null;
  professional: {
    id: string;
    fullName: string;
    displayName: string;
  };
  consultationType: {
    id: string;
    name: string;
  };
}

@Injectable()
export class ClinicInsightsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly schedulingAccessService: SchedulingAccessService,
    private readonly timezoneService: SchedulingTimezoneService,
  ) {}

  async getExecutiveDashboard(
    actor: AuthenticatedUser,
    query: AestheticClinicExecutiveDashboardQuery,
  ): Promise<AestheticClinicExecutiveDashboardResponse> {
    const tenantId = this.schedulingAccessService.resolveActiveTenantId(actor);
    const periodDays = this.resolvePeriodDays(query.periodDays);
    const now = await this.timezoneService.getCurrentInstant();
    const timezone = await this.timezoneService.getTenantTimezone(tenantId);
    const currentDateKey = this.timezoneService.getTenantDateKey(now, timezone);
    const currentDayContext = this.timezoneService.buildDayContext(
      currentDateKey,
      timezone,
    );
    const rangeStartSeed = new Date(
      currentDayContext.dayStartUtc.getTime() - (periodDays - 1) * 86400000,
    );
    const rangeStartDateKey = this.timezoneService.getTenantDateKey(
      rangeStartSeed,
      timezone,
    );
    const rangeStartUtc = this.timezoneService.buildDayContext(
      rangeStartDateKey,
      timezone,
    ).dayStartUtc;

    const [clinic, subscription, appointments, threads] = await Promise.all([
      this.prisma.clinic.findUnique({
        where: { tenantId },
        select: { timezone: true, displayName: true },
      }),
      this.prisma.subscription.findFirst({
        where: { tenantId },
        orderBy: [{ startsAt: "desc" }, { createdAt: "desc" }],
        include: {
          plan: {
            select: {
              name: true,
              priceCents: true,
              currency: true,
            },
          },
        },
      }),
      this.prisma.appointment.findMany({
        where: {
          tenantId,
          startsAt: {
            gte: rangeStartUtc,
            lte: now,
          },
        },
        orderBy: { startsAt: "asc" },
        select: {
          status: true,
          startsAt: true,
          checkedInAt: true,
          professional: {
            select: {
              id: true,
              fullName: true,
              displayName: true,
            },
          },
          consultationType: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      }),
      this.prisma.messageThread.findMany({
        where: {
          tenantId,
          createdAt: {
            gte: rangeStartUtc,
            lte: now,
          },
        },
        select: {
          id: true,
          lastIntent: true,
          handoffRequests: {
            select: {
              reason: true,
            },
          },
        },
      }),
    ]);

    const resolvedTimezone = clinic?.timezone ?? timezone;
    const typedAppointments = appointments as DashboardAppointmentRecord[];

    const totalAppointments = typedAppointments.length;
    const completed = typedAppointments.filter(
      (item) => item.status === AppointmentStatus.COMPLETED,
    ).length;
    const canceled = typedAppointments.filter(
      (item) => item.status === AppointmentStatus.CANCELED,
    ).length;
    const noShow = typedAppointments.filter(
      (item) => item.status === AppointmentStatus.NO_SHOW,
    ).length;
    const checkedIn = typedAppointments.filter(
      (item) =>
        item.status === AppointmentStatus.CHECKED_IN ||
        item.status === AppointmentStatus.CALLED ||
        item.status === AppointmentStatus.IN_PROGRESS ||
        item.status === AppointmentStatus.AWAITING_CLOSURE ||
        item.status === AppointmentStatus.AWAITING_PAYMENT,
    ).length;
    const pendingConfirmation = typedAppointments.filter(
      (item) =>
        item.status === AppointmentStatus.BOOKED ||
        item.status === AppointmentStatus.RESCHEDULED,
    ).length;

    const checkInDelayMinutes = typedAppointments
      .filter((item) => item.checkedInAt)
      .map((item) => {
        const delay = this.diffMinutes(item.checkedInAt as Date, item.startsAt);
        return delay > 0 ? delay : 0;
      });
    const earlyCheckInMinutes = typedAppointments
      .filter((item) => item.checkedInAt)
      .map((item) => {
        const delay = this.diffMinutes(item.checkedInAt as Date, item.startsAt);
        return delay < 0 ? Math.abs(delay) : 0;
      });

    const consultationNoShow = this.buildConsultationNoShow(typedAppointments);
    const professionals = this.buildProfessionalPerformance(typedAppointments);
    const workloadByHour = this.buildWorkloadByHour(
      typedAppointments,
      resolvedTimezone,
    );
    const noShowTimeline = this.buildNoShowTimeline(
      typedAppointments,
      periodDays,
      rangeStartUtc,
      now,
      resolvedTimezone,
    );

    const hasRevenueStatus =
      subscription?.status === SubscriptionStatus.ACTIVE ||
      subscription?.status === SubscriptionStatus.TRIAL ||
      subscription?.status === SubscriptionStatus.PAST_DUE;

    return {
      generatedAt: now.toISOString(),
      clinicDisplayName: clinic?.displayName ?? null,
      timezone: resolvedTimezone,
      periodDays,
      range: {
        startsAt: rangeStartUtc.toISOString(),
        endsAt: now.toISOString(),
      },
      appointments: {
        total: totalAppointments,
        completed,
        canceled,
        noShow,
        checkedIn,
        pendingConfirmation,
        completionRate: this.toPercentage(completed, totalAppointments),
        cancellationRate: this.toPercentage(canceled, totalAppointments),
        noShowRate: this.toPercentage(noShow, totalAppointments),
        averageCheckInDelayMinutes: this.averageOf(checkInDelayMinutes),
        averageEarlyCheckInMinutes: this.averageOf(earlyCheckInMinutes),
      },
      finance: {
        subscriptionStatus: subscription?.status ?? null,
        planName: subscription?.plan.name ?? null,
        currency: subscription?.plan.currency ?? null,
        monthlyRevenueCents:
          hasRevenueStatus && subscription ? subscription.plan.priceCents : 0,
        isPastDue: subscription?.status === SubscriptionStatus.PAST_DUE,
        startsAt: subscription?.startsAt.toISOString() ?? null,
        endsAt: subscription?.endsAt?.toISOString() ?? null,
      },
      quality: {
        utilizationRate: this.toPercentage(completed + checkedIn, totalAppointments),
        consultationTypeNoShow: consultationNoShow,
        professionalPerformance: professionals,
        workloadByHour,
        noShowTimeline,
      },
      agent: this.buildAgentMetrics(appointments as any, threads),
    };
  }

  private buildAgentMetrics(
    appointments: DashboardAppointmentRecord[],
    threads: any[],
  ) {
    const totalConversations = threads.length;
    const qualifiedLeads = threads.filter((t) => t.lastIntent).length;
    const bookings = threads.filter((t) => t.lastIntent === "BOOK_APPOINTMENT").length;
    
    const escalations = threads.filter((t) => t.handoffRequests.length > 0);
    const escalationCount = escalations.length;

    // Group escalation reasons
    const reasonCounts = new Map<string, number>();
    for (const thread of escalations) {
      for (const handoff of thread.handoffRequests) {
        const reason = handoff.reason || "Outro";
        reasonCounts.set(reason, (reasonCounts.get(reason) || 0) + 1);
      }
    }

    const escalationReasons: AestheticClinicDashboardAgentEscalationReason[] = Array.from(
      reasonCounts.entries(),
    )
      .map(([reason, count]) => ({
        reason,
        count,
        percentage: this.toPercentage(count, escalationCount),
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return {
      totalConversations,
      qualifiedLeads,
      conversionToAppointmentRate: this.toPercentage(bookings, totalConversations),
      escalationRate: this.toPercentage(escalationCount, totalConversations),
      escalationReasons,
    };
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

  private buildConsultationNoShow(
    appointments: DashboardAppointmentRecord[],
  ): AestheticClinicDashboardConsultationTypeNoShow[] {
    const grouped = new Map<
      string,
      {
        consultationTypeId: string;
        consultationTypeName: string;
        total: number;
        noShow: number;
      }
    >();

    for (const appointment of appointments) {
      const key = appointment.consultationType.id;
      const current = grouped.get(key) ?? {
        consultationTypeId: appointment.consultationType.id,
        consultationTypeName: appointment.consultationType.name,
        total: 0,
        noShow: 0,
      };

      current.total += 1;
      if (appointment.status === AppointmentStatus.NO_SHOW) {
        current.noShow += 1;
      }
      grouped.set(key, current);
    }

    return Array.from(grouped.values())
      .map((item) => ({
        ...item,
        noShowRate: this.toPercentage(item.noShow, item.total),
      }))
      .sort((left, right) => {
        if (right.noShowRate !== left.noShowRate) {
          return right.noShowRate - left.noShowRate;
        }

        return right.total - left.total;
      })
      .slice(0, 5);
  }

  private buildProfessionalPerformance(appointments: DashboardAppointmentRecord[]) {
    const grouped = new Map<
      string,
      {
        professionalId: string;
        professionalName: string;
        total: number;
        completed: number;
        noShow: number;
      }
    >();

    for (const appointment of appointments) {
      const key = appointment.professional.id;
      const current = grouped.get(key) ?? {
        professionalId: appointment.professional.id,
        professionalName:
          appointment.professional.displayName || appointment.professional.fullName,
        total: 0,
        completed: 0,
        noShow: 0,
      };

      current.total += 1;
      if (appointment.status === AppointmentStatus.COMPLETED) {
        current.completed += 1;
      }
      if (appointment.status === AppointmentStatus.NO_SHOW) {
        current.noShow += 1;
      }
      grouped.set(key, current);
    }

    return Array.from(grouped.values())
      .map((item) => ({
        ...item,
        completionRate: this.toPercentage(item.completed, item.total),
        noShowRate: this.toPercentage(item.noShow, item.total),
      }))
      .sort((left, right) => right.total - left.total)
      .slice(0, 8);
  }

  private buildWorkloadByHour(
    appointments: DashboardAppointmentRecord[],
    timeZone: string,
  ): AestheticClinicDashboardWorkloadByHour[] {
    const grouped = new Map<string, number>();

    for (const appointment of appointments) {
      const hourLabel = `${this.formatHourLabel(appointment.startsAt, timeZone)}h`;
      grouped.set(hourLabel, (grouped.get(hourLabel) ?? 0) + 1);
    }

    return Array.from(grouped.entries())
      .map(([hourLabel, total]) => ({ hourLabel, total }))
      .sort((left, right) => left.hourLabel.localeCompare(right.hourLabel));
  }

  private buildNoShowTimeline(
    appointments: DashboardAppointmentRecord[],
    periodDays: number,
    rangeStartUtc: Date,
    now: Date,
    timeZone: string,
  ): AestheticClinicDashboardTimelinePoint[] {
    const grouped = new Map<string, { total: number; noShow: number }>();

    for (const appointment of appointments) {
      const dayKey = this.toDateKey(appointment.startsAt, timeZone);
      const current = grouped.get(dayKey) ?? { total: 0, noShow: 0 };
      current.total += 1;
      if (appointment.status === AppointmentStatus.NO_SHOW) {
        current.noShow += 1;
      }
      grouped.set(dayKey, current);
    }

    const timeline: AestheticClinicDashboardTimelinePoint[] = [];
    const cursor = new Date(rangeStartUtc);

    for (let i = 0; i < periodDays; i += 1) {
      if (cursor > now) {
        break;
      }

      const dayKey = this.toDateKey(cursor, timeZone);
      const dayLabel = this.toDateLabel(cursor, timeZone);
      const current = grouped.get(dayKey) ?? { total: 0, noShow: 0 };
      timeline.push({
        dayKey,
        dayLabel,
        total: current.total,
        noShow: current.noShow,
        noShowRate: this.toPercentage(current.noShow, current.total),
      });

      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    return timeline;
  }

  private diffMinutes(left: Date, right: Date): number {
    return Math.round((left.getTime() - right.getTime()) / 60000);
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
      (values.reduce((accumulator, item) => accumulator + item, 0) / values.length).toFixed(1),
    );
  }

  private toDateKey(value: Date, timeZone: string): string {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(value);
  }

  private toDateLabel(value: Date, timeZone: string): string {
    return new Intl.DateTimeFormat("pt-BR", {
      timeZone,
      day: "2-digit",
      month: "2-digit",
    }).format(value);
  }

  private formatHourLabel(value: Date, timeZone: string): string {
    return new Intl.DateTimeFormat("pt-BR", {
      timeZone,
      hour: "2-digit",
      hour12: false,
    }).format(value);
  }
}
