import {
  BadRequestException,
  ConflictException,
  Injectable,
} from "@nestjs/common";
import {
  AppointmentStatus,
  Prisma,
  PrismaClient,
  SlotHoldStatus,
} from "@prisma/client";
import { MAX_CONSULTATION_BUFFER_MINUTES } from "../../common/constants/clinic.constants";
import { PrismaService } from "../../database/prisma.service";
import { SchedulingTimezoneService } from "./scheduling-timezone.service";

type DbClient = Prisma.TransactionClient | PrismaClient | PrismaService;

interface AppointmentWindow {
  startsAt: Date;
  endsAt: Date;
  occupancyStartsAt: Date;
  occupancyEndsAt: Date;
  durationMinutes: number;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
}

interface AppointmentPolicyTarget {
  status: AppointmentStatus;
  startsAt: Date;
}

interface ActiveHoldConflictCheckInput {
  tenantId: string;
  professionalId: string;
  occupancyStartsAt: Date;
  occupancyEndsAt: Date;
  ignoreHoldId?: string;
  message?: string;
}

interface AppointmentOccupancyConflictCheckInput {
  tenantId: string;
  professionalId: string;
  occupancyStartsAt: Date;
  occupancyEndsAt: Date;
  excludeAppointmentId?: string;
  message?: string;
}

export interface SchedulingConflictCheckInput {
  tenantId: string;
  professionalId: string;
  startsAt: Date;
  durationMinutes: number;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  unitId?: string | null;
  excludeAppointmentId?: string;
  ignoreHoldId?: string;
}

@Injectable()
export class SchedulingPoliciesService {
  private static readonly APPOINTMENT_BLOCKING_STATUSES: AppointmentStatus[] = [
    AppointmentStatus.BOOKED,
    AppointmentStatus.CONFIRMED,
    AppointmentStatus.CHECKED_IN,
    AppointmentStatus.CALLED,
    AppointmentStatus.IN_PROGRESS,
    AppointmentStatus.AWAITING_CLOSURE,
    AppointmentStatus.RESCHEDULED,
  ];

  private static readonly MIN_CHANGE_NOTICE_MINUTES = 10;
  private static readonly RESCHEDULABLE_STATUSES: AppointmentStatus[] = [
    AppointmentStatus.BOOKED,
    AppointmentStatus.CONFIRMED,
    AppointmentStatus.RESCHEDULED,
  ];
  private static readonly CONFIRMABLE_STATUSES: AppointmentStatus[] = [
    AppointmentStatus.BOOKED,
    AppointmentStatus.RESCHEDULED,
  ];

  constructor(
    private readonly prisma: PrismaService,
    private readonly timezoneService: SchedulingTimezoneService,
  ) {}

  static getBlockingStatuses(): AppointmentStatus[] {
    return [...SchedulingPoliciesService.APPOINTMENT_BLOCKING_STATUSES];
  }

  calculateAppointmentWindow(input: {
    startsAt: Date;
    durationMinutes: number;
    bufferBeforeMinutes: number;
    bufferAfterMinutes: number;
  }): AppointmentWindow {
    const endsAt = this.addMinutes(input.startsAt, input.durationMinutes);

    return {
      startsAt: input.startsAt,
      endsAt,
      occupancyStartsAt: this.addMinutes(input.startsAt, -input.bufferBeforeMinutes),
      occupancyEndsAt: this.addMinutes(endsAt, input.bufferAfterMinutes),
      durationMinutes: input.durationMinutes,
      bufferBeforeMinutes: input.bufferBeforeMinutes,
      bufferAfterMinutes: input.bufferAfterMinutes,
    };
  }

  async expireStaleHolds(
    tenantId: string,
    dbClient?: DbClient,
    referenceInstant?: Date,
  ): Promise<void> {
    const db = dbClient ?? this.prisma;
    const now =
      referenceInstant ?? (await this.timezoneService.getCurrentInstant(db));

    await db.slotHold.updateMany({
      where: {
        tenantId,
        status: SlotHoldStatus.ACTIVE,
        expiresAt: {
          lte: now,
        },
      },
      data: {
        status: SlotHoldStatus.EXPIRED,
      },
    });
  }

  buildOccupancyCandidateRange(
    occupancyStartsAt: Date,
    occupancyEndsAt: Date,
  ): {
    rangeStart: Date;
    rangeEnd: Date;
  } {
    return {
      rangeStart: this.addMinutes(
        occupancyStartsAt,
        -MAX_CONSULTATION_BUFFER_MINUTES,
      ),
      rangeEnd: this.addMinutes(
        occupancyEndsAt,
        MAX_CONSULTATION_BUFFER_MINUTES,
      ),
    };
  }

  async assertNoSchedulingConflict(
    input: SchedulingConflictCheckInput,
    dbClient?: DbClient,
  ): Promise<void> {
    const db = dbClient ?? this.prisma;

    const window = this.calculateAppointmentWindow({
      startsAt: input.startsAt,
      durationMinutes: input.durationMinutes,
      bufferBeforeMinutes: input.bufferBeforeMinutes,
      bufferAfterMinutes: input.bufferAfterMinutes,
    });

    await this.assertCoveredByProfessionalSchedule(
      {
        tenantId: input.tenantId,
        professionalId: input.professionalId,
        unitId: input.unitId ?? null,
        startsAt: input.startsAt,
        occupancyStartsAt: window.occupancyStartsAt,
        occupancyEndsAt: window.occupancyEndsAt,
      },
      db,
    );

    const conflictingBlock = await db.scheduleBlock.findFirst({
      where: {
        tenantId: input.tenantId,
        professionalId: input.professionalId,
        isActive: true,
        startsAt: {
          lt: window.occupancyEndsAt,
        },
        endsAt: {
          gt: window.occupancyStartsAt,
        },
      },
      select: {
        id: true,
      },
    });

    if (conflictingBlock) {
      throw new ConflictException(
        "Requested slot conflicts with an active schedule block.",
      );
    }

    await this.assertNoActiveHoldConflict(
      {
        tenantId: input.tenantId,
        professionalId: input.professionalId,
        occupancyStartsAt: window.occupancyStartsAt,
        occupancyEndsAt: window.occupancyEndsAt,
        ignoreHoldId: input.ignoreHoldId,
      },
      db,
    );

    await this.assertNoAppointmentOccupancyConflict(
      {
        tenantId: input.tenantId,
        professionalId: input.professionalId,
        occupancyStartsAt: window.occupancyStartsAt,
        occupancyEndsAt: window.occupancyEndsAt,
        excludeAppointmentId: input.excludeAppointmentId,
      },
      db,
    );
  }

  async assertNoActiveHoldConflict(
    input: ActiveHoldConflictCheckInput,
    dbClient?: DbClient,
    referenceInstant?: Date,
  ): Promise<void> {
    const db = dbClient ?? this.prisma;
    const now =
      referenceInstant ?? (await this.timezoneService.getCurrentInstant(db));

    await this.expireStaleHolds(input.tenantId, db, now);

    const candidateRange = this.buildOccupancyCandidateRange(
      input.occupancyStartsAt,
      input.occupancyEndsAt,
    );

    const holds = await db.slotHold.findMany({
      where: {
        tenantId: input.tenantId,
        professionalId: input.professionalId,
        status: SlotHoldStatus.ACTIVE,
        expiresAt: {
          gt: now,
        },
        startsAt: {
          lt: candidateRange.rangeEnd,
        },
        endsAt: {
          gt: candidateRange.rangeStart,
        },
        ...(input.ignoreHoldId
          ? {
              id: {
                not: input.ignoreHoldId,
              },
            }
          : {}),
      },
      select: {
        id: true,
        startsAt: true,
        endsAt: true,
        bufferBeforeMinutes: true,
        bufferAfterMinutes: true,
      },
    });

    const conflictingHold = holds.find((hold) =>
      this.intervalsOverlap(
        this.addMinutes(hold.startsAt, -hold.bufferBeforeMinutes),
        this.addMinutes(hold.endsAt, hold.bufferAfterMinutes),
        input.occupancyStartsAt,
        input.occupancyEndsAt,
      ),
    );

    if (conflictingHold) {
      throw new ConflictException(input.message ?? "Requested slot is currently held.");
    }
  }

  async assertNoAppointmentOccupancyConflict(
    input: AppointmentOccupancyConflictCheckInput,
    dbClient?: DbClient,
  ): Promise<void> {
    const db = dbClient ?? this.prisma;

    const candidateRange = this.buildOccupancyCandidateRange(
      input.occupancyStartsAt,
      input.occupancyEndsAt,
    );

    const appointments = await db.appointment.findMany({
      where: {
        tenantId: input.tenantId,
        professionalId: input.professionalId,
        status: {
          in: SchedulingPoliciesService.APPOINTMENT_BLOCKING_STATUSES,
        },
        startsAt: {
          lt: candidateRange.rangeEnd,
        },
        endsAt: {
          gt: candidateRange.rangeStart,
        },
        ...(input.excludeAppointmentId
          ? {
              id: {
                not: input.excludeAppointmentId,
              },
            }
          : {}),
      },
      select: {
        id: true,
        startsAt: true,
        endsAt: true,
        bufferBeforeMinutes: true,
        bufferAfterMinutes: true,
      },
    });

    const hasAppointmentConflict = appointments.some((appointment) => {
      const appointmentOccupancyStart = this.addMinutes(
        appointment.startsAt,
        -appointment.bufferBeforeMinutes,
      );
      const appointmentOccupancyEnd = this.addMinutes(
        appointment.endsAt,
        appointment.bufferAfterMinutes,
      );

      return this.intervalsOverlap(
        appointmentOccupancyStart,
        appointmentOccupancyEnd,
        input.occupancyStartsAt,
        input.occupancyEndsAt,
      );
    });

    if (hasAppointmentConflict) {
      throw new ConflictException(
        input.message ?? "Requested slot conflicts with another appointment.",
      );
    }
  }

  assertCanReschedule(
    appointment: AppointmentPolicyTarget,
    currentInstant: Date = new Date(),
  ): void {
    if (!SchedulingPoliciesService.RESCHEDULABLE_STATUSES.includes(appointment.status)) {
      throw new BadRequestException(
        "Only BOOKED, CONFIRMED or RESCHEDULED appointments can be rescheduled.",
      );
    }

    this.assertChangeNoticeWindow(appointment.startsAt, currentInstant);
  }

  assertCanCancel(
    appointment: AppointmentPolicyTarget,
    currentInstant: Date = new Date(),
  ): void {
    if (!SchedulingPoliciesService.RESCHEDULABLE_STATUSES.includes(appointment.status)) {
      throw new BadRequestException(
        "Only BOOKED, CONFIRMED or RESCHEDULED appointments can be canceled.",
      );
    }

    this.assertChangeNoticeWindow(appointment.startsAt, currentInstant);
  }

  assertCanConfirm(appointment: AppointmentPolicyTarget): void {
    if (!SchedulingPoliciesService.CONFIRMABLE_STATUSES.includes(appointment.status)) {
      throw new BadRequestException(
        "Only BOOKED or RESCHEDULED appointments can be confirmed.",
      );
    }
  }

  assertCanCheckIn(
    appointment: AppointmentPolicyTarget,
    timezone: string,
    currentInstant: Date = new Date(),
  ): void {
    if (!SchedulingPoliciesService.RESCHEDULABLE_STATUSES.includes(appointment.status)) {
      throw new BadRequestException(
        "Only BOOKED, CONFIRMED or RESCHEDULED appointments can be checked in.",
      );
    }

    const today = this.timezoneService.getTenantDateKey(currentInstant, timezone);
    const appointmentDate = this.timezoneService.getTenantDateKey(
      appointment.startsAt,
      timezone,
    );

    if (today !== appointmentDate) {
      throw new BadRequestException(
        "Check-in is only allowed on the appointment local day.",
      );
    }
  }

  assertCanMarkNoShow(
    appointment: AppointmentPolicyTarget,
    currentInstant: Date = new Date(),
  ): void {
    if (!SchedulingPoliciesService.RESCHEDULABLE_STATUSES.includes(appointment.status)) {
      throw new BadRequestException(
        "Only BOOKED, CONFIRMED or RESCHEDULED appointments can be marked as no-show.",
      );
    }

    if (appointment.startsAt.getTime() > currentInstant.getTime()) {
      throw new BadRequestException(
        "No-show can only be set after the appointment start time.",
      );
    }
  }

  assertCanStart(
    appointment: AppointmentPolicyTarget,
  ): void {
    if (appointment.status !== AppointmentStatus.CALLED) {
      throw new BadRequestException(
        "Only called appointments can be started.",
      );
    }
  }

  assertCanCall(appointment: AppointmentPolicyTarget): void {
    if (appointment.status !== AppointmentStatus.CHECKED_IN) {
      throw new BadRequestException(
        "Only checked-in appointments can be called.",
      );
    }
  }

  assertCanPrepareClosure(appointment: AppointmentPolicyTarget): void {
    if (appointment.status !== AppointmentStatus.IN_PROGRESS) {
      throw new BadRequestException(
        "Only appointments in progress can be sent to closure.",
      );
    }
  }

  assertCanSendToReception(appointment: AppointmentPolicyTarget): void {
    if (appointment.status !== AppointmentStatus.AWAITING_CLOSURE) {
      throw new BadRequestException(
        "Only appointments awaiting closure can be returned to reception.",
      );
    }
  }

  assertCanComplete(
    appointment: AppointmentPolicyTarget,
  ): void {
    if (appointment.status !== AppointmentStatus.AWAITING_PAYMENT) {
      throw new BadRequestException(
        "Only appointments awaiting payment can be completed.",
      );
    }
  }

  private assertChangeNoticeWindow(
    startsAt: Date,
    currentInstant: Date = new Date(),
  ): void {
    if (startsAt.getTime() <= currentInstant.getTime()) {
      throw new BadRequestException(
        "Cannot change appointments that already started or are in the past.",
      );
    }

    const minutesUntilStart = Math.floor(
      (startsAt.getTime() - currentInstant.getTime()) / 60000,
    );

    if (minutesUntilStart < SchedulingPoliciesService.MIN_CHANGE_NOTICE_MINUTES) {
      throw new BadRequestException(
        `Changes require at least ${SchedulingPoliciesService.MIN_CHANGE_NOTICE_MINUTES} minutes notice.`,
      );
    }
  }

  private async assertCoveredByProfessionalSchedule(
    input: {
      tenantId: string;
      professionalId: string;
      unitId: string | null;
      startsAt: Date;
      occupancyStartsAt: Date;
      occupancyEndsAt: Date;
    },
    dbClient: DbClient,
  ): Promise<void> {
    const dayContext = await this.timezoneService.getDayContextByInstant(
      input.tenantId,
      input.startsAt,
      dbClient,
    );

    const schedules = await dbClient.professionalSchedule.findMany({
      where: {
        tenantId: input.tenantId,
        professionalId: input.professionalId,
        dayOfWeek: dayContext.weekday,
        isActive: true,
        AND: [
          {
            OR: [
              { validFrom: null },
              {
                validFrom: {
                  lte: dayContext.dateValue,
                },
              },
            ],
          },
          {
            OR: [
              { validTo: null },
              {
                validTo: {
                  gte: dayContext.dateValue,
                },
              },
            ],
          },
        ],
      },
      orderBy: {
        startTime: "asc",
      },
    });

    for (const schedule of schedules) {
      if (input.unitId && schedule.unitId && schedule.unitId !== input.unitId) {
        continue;
      }

      const windowStart = this.timezoneService.combineDateAndTime(
        dayContext.date,
        schedule.startTime,
        dayContext.timezone,
      );
      const windowEnd = this.timezoneService.combineDateAndTime(
        dayContext.date,
        schedule.endTime,
        dayContext.timezone,
      );

      const occupancyInsideWindow =
        input.occupancyStartsAt.getTime() >= windowStart.getTime() &&
        input.occupancyEndsAt.getTime() <= windowEnd.getTime();

      if (!occupancyInsideWindow) {
        continue;
      }

      const minutesFromWindowStart = Math.floor(
        (input.startsAt.getTime() - windowStart.getTime()) / 60000,
      );

      if (minutesFromWindowStart < 0) {
        continue;
      }

      if (minutesFromWindowStart % schedule.slotIntervalMinutes !== 0) {
        continue;
      }

      return;
    }

    throw new BadRequestException(
      "Requested slot is outside professional schedule coverage.",
    );
  }

  private addMinutes(date: Date, minutes: number): Date {
    return new Date(date.getTime() + minutes * 60000);
  }

  private intervalsOverlap(
    leftStart: Date,
    leftEnd: Date,
    rightStart: Date,
    rightEnd: Date,
  ): boolean {
    return leftStart.getTime() < rightEnd.getTime() && leftEnd.getTime() > rightStart.getTime();
  }
}
