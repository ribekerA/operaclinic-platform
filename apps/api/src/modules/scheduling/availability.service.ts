import {
  BadRequestException,
  ConflictException,
  Injectable,
} from "@nestjs/common";
import { SlotHoldStatus } from "@prisma/client";
import { AuthenticatedUser } from "../../auth/interfaces/authenticated-user.interface";
import { AUDIT_ACTIONS } from "../../common/audit/audit.constants";
import { AuditService } from "../../common/audit/audit.service";
import { PrismaService } from "../../database/prisma.service";
import { CreateSlotHoldDto } from "./dto/create-slot-hold.dto";
import { SearchAvailabilityQueryDto } from "./dto/search-availability-query.dto";
import { AvailabilitySlotResponse } from "./interfaces/availability-slot.response";
import { SlotHoldResponse } from "./interfaces/slot-hold.response";
import { SchedulingAccessService } from "./scheduling-access.service";
import { SchedulingConcurrencyService } from "./scheduling-concurrency.service";
import { isSchedulingOccupancyConflictError } from "./scheduling-database-errors";
import { SchedulingPoliciesService } from "./scheduling-policies.service";
import { SchedulingReferencesService } from "./scheduling-references.service";
import { SchedulingTimezoneService } from "./scheduling-timezone.service";

@Injectable()
export class AvailabilityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accessService: SchedulingAccessService,
    private readonly concurrencyService: SchedulingConcurrencyService,
    private readonly policiesService: SchedulingPoliciesService,
    private readonly referencesService: SchedulingReferencesService,
    private readonly timezoneService: SchedulingTimezoneService,
    private readonly auditService: AuditService,
  ) {}

  async searchAvailability(
    actor: AuthenticatedUser,
    query: SearchAvailabilityQueryDto,
  ): Promise<AvailabilitySlotResponse[]> {
    const tenantId = this.accessService.resolveActiveTenantId(actor);
    const currentInstant = await this.timezoneService.getCurrentInstant();

    const professionalId = this.normalizeRequiredId(query.professionalId, "professionalId");
    const consultationTypeId = this.normalizeRequiredId(
      query.consultationTypeId,
      "consultationTypeId",
    );
    const unitId = query.unitId ? this.normalizeRequiredId(query.unitId, "unitId") : null;

    await this.referencesService.assertProfessionalBelongsToTenant(
      professionalId,
      tenantId,
      {
        requireActive: true,
      },
    );
    await this.referencesService.assertUnitBelongsToTenant(unitId, tenantId);
    await this.referencesService.assertProfessionalAssignedToUnit(
      professionalId,
      unitId,
      tenantId,
    );

    const consultationType = await this.referencesService.getActiveConsultationType(
      consultationTypeId,
      tenantId,
    );

    const dayContext = await this.timezoneService.getDayContextByDateInput(
      tenantId,
      query.date,
    );
    const candidateRange = this.policiesService.buildOccupancyCandidateRange(
      dayContext.dayStartUtc,
      dayContext.dayEndUtcExclusive,
    );

    await this.policiesService.expireStaleHolds(tenantId, undefined, currentInstant);

    const [schedules, blocks, holds, appointments] = await Promise.all([
      this.prisma.professionalSchedule.findMany({
        where: {
          tenantId,
          professionalId,
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
      }),
      this.prisma.scheduleBlock.findMany({
        where: {
          tenantId,
          professionalId,
          isActive: true,
          startsAt: {
            lt: dayContext.dayEndUtcExclusive,
          },
          endsAt: {
            gt: dayContext.dayStartUtc,
          },
        },
        select: {
          startsAt: true,
          endsAt: true,
        },
      }),
      this.prisma.slotHold.findMany({
        where: {
          tenantId,
          professionalId,
          status: SlotHoldStatus.ACTIVE,
          expiresAt: {
            gt: currentInstant,
          },
          startsAt: {
            lt: candidateRange.rangeEnd,
          },
          endsAt: {
            gt: candidateRange.rangeStart,
          },
        },
        select: {
          startsAt: true,
          endsAt: true,
          bufferBeforeMinutes: true,
          bufferAfterMinutes: true,
        },
      }),
      this.prisma.appointment.findMany({
        where: {
          tenantId,
          professionalId,
          status: {
            in: SchedulingPoliciesService.getBlockingStatuses(),
          },
          startsAt: {
            lt: candidateRange.rangeEnd,
          },
          endsAt: {
            gt: candidateRange.rangeStart,
          },
        },
        select: {
          startsAt: true,
          endsAt: true,
          bufferBeforeMinutes: true,
          bufferAfterMinutes: true,
        },
      }),
    ]);

    const slotsByKey = new Map<string, AvailabilitySlotResponse>();

    for (const schedule of schedules) {
      if (unitId && schedule.unitId && schedule.unitId !== unitId) {
        continue;
      }

      const scheduleStart = this.timezoneService.combineDateAndTime(
        dayContext.date,
        schedule.startTime,
        dayContext.timezone,
      );
      const scheduleEnd = this.timezoneService.combineDateAndTime(
        dayContext.date,
        schedule.endTime,
        dayContext.timezone,
      );

      for (
        let cursor = new Date(scheduleStart);
        cursor.getTime() < scheduleEnd.getTime();
        cursor = new Date(cursor.getTime() + schedule.slotIntervalMinutes * 60000)
      ) {
        const slotWindow = this.policiesService.calculateAppointmentWindow({
          startsAt: cursor,
          durationMinutes: consultationType.durationMinutes,
          bufferBeforeMinutes: consultationType.bufferBeforeMinutes,
          bufferAfterMinutes: consultationType.bufferAfterMinutes,
        });

        const occupancyInsideSchedule =
          slotWindow.occupancyStartsAt.getTime() >= scheduleStart.getTime() &&
          slotWindow.occupancyEndsAt.getTime() <= scheduleEnd.getTime();

        if (!occupancyInsideSchedule) {
          continue;
        }

        if (
          this.hasSimpleConflict(
            slotWindow.occupancyStartsAt,
            slotWindow.occupancyEndsAt,
            blocks,
          )
        ) {
          continue;
        }

        if (
          this.hasHoldConflict(
            slotWindow.occupancyStartsAt,
            slotWindow.occupancyEndsAt,
            holds,
          )
        ) {
          continue;
        }

        if (
          this.hasAppointmentConflict(
            slotWindow.occupancyStartsAt,
            slotWindow.occupancyEndsAt,
            appointments,
          )
        ) {
          continue;
        }

        const key = slotWindow.startsAt.toISOString();

        if (!slotsByKey.has(key)) {
          slotsByKey.set(key, {
            startsAt: slotWindow.startsAt,
            endsAt: slotWindow.endsAt,
            occupancyStartsAt: slotWindow.occupancyStartsAt,
            occupancyEndsAt: slotWindow.occupancyEndsAt,
            professionalId,
            unitId: schedule.unitId ?? unitId,
          });
        }
      }
    }

    return [...slotsByKey.values()].sort(
      (left, right) => left.startsAt.getTime() - right.startsAt.getTime(),
    );
  }

  async createSlotHold(
    actor: AuthenticatedUser,
    input: CreateSlotHoldDto,
  ): Promise<SlotHoldResponse> {
    const tenantId = this.accessService.resolveActiveTenantId(actor);
    const currentInstant = await this.timezoneService.getCurrentInstant();

    const professionalId = this.normalizeRequiredId(input.professionalId, "professionalId");
    const consultationTypeId = this.normalizeRequiredId(
      input.consultationTypeId,
      "consultationTypeId",
    );
    const patientId = input.patientId ? this.normalizeRequiredId(input.patientId, "patientId") : null;
    const unitId = input.unitId ? this.normalizeRequiredId(input.unitId, "unitId") : null;
    const room = this.normalizeOptionalText(input.room, 80, "room");
    const startsAt = this.parseDateTime(input.startsAt, "startsAt");
    const ttlMinutes = this.parseTtlMinutes(input.ttlMinutes);

    if (startsAt.getTime() <= currentInstant.getTime()) {
      throw new BadRequestException("startsAt must be a future datetime.");
    }

    await this.referencesService.assertProfessionalBelongsToTenant(
      professionalId,
      tenantId,
      {
        requireActive: true,
      },
    );
    await this.referencesService.assertUnitBelongsToTenant(unitId, tenantId);
    await this.referencesService.assertProfessionalAssignedToUnit(
      professionalId,
      unitId,
      tenantId,
    );

    if (patientId) {
      await this.referencesService.assertPatientBelongsToTenant(patientId, tenantId);
    }

    try {
      const hold = await this.concurrencyService.runExclusiveForProfessional(
        tenantId,
        professionalId,
        async (tx) => {
          const transactionNow = await this.timezoneService.getCurrentInstant(tx);
          await this.policiesService.expireStaleHolds(tenantId, tx, transactionNow);

          const consultationType = await this.referencesService.getActiveConsultationType(
            consultationTypeId,
            tenantId,
            tx,
          );

          await this.policiesService.assertNoSchedulingConflict(
            {
              tenantId,
              professionalId,
              startsAt,
              durationMinutes: consultationType.durationMinutes,
              bufferBeforeMinutes: consultationType.bufferBeforeMinutes,
              bufferAfterMinutes: consultationType.bufferAfterMinutes,
              unitId,
            },
            tx,
          );

          const window = this.policiesService.calculateAppointmentWindow({
            startsAt,
            durationMinutes: consultationType.durationMinutes,
            bufferBeforeMinutes: consultationType.bufferBeforeMinutes,
            bufferAfterMinutes: consultationType.bufferAfterMinutes,
          });

          const existing = await tx.slotHold.findFirst({
            where: {
              tenantId,
              professionalId,
              consultationTypeId,
              unitId,
              patientId,
              status: SlotHoldStatus.ACTIVE,
              expiresAt: {
                gt: transactionNow,
              },
              startsAt: window.startsAt,
              endsAt: window.endsAt,
              durationMinutes: consultationType.durationMinutes,
              bufferBeforeMinutes: consultationType.bufferBeforeMinutes,
              bufferAfterMinutes: consultationType.bufferAfterMinutes,
            },
          });

          if (existing) {
            return existing;
          }

          const expiresAt = new Date(
            transactionNow.getTime() + ttlMinutes * 60000,
          );

          const created = await tx.slotHold.create({
            data: {
              tenantId,
              patientId,
              professionalId,
              consultationTypeId,
              unitId,
              room,
              startsAt: window.startsAt,
              endsAt: window.endsAt,
              durationMinutes: consultationType.durationMinutes,
              bufferBeforeMinutes: consultationType.bufferBeforeMinutes,
              bufferAfterMinutes: consultationType.bufferAfterMinutes,
              expiresAt,
              status: SlotHoldStatus.ACTIVE,
              createdByUserId: actor.id,
            },
          });

          await this.auditService.record(
            {
              action: AUDIT_ACTIONS.SLOT_HOLD_CREATED,
              actor,
              tenantId,
              targetType: "slot_hold",
              targetId: created.id,
              metadata: {
                patientId,
                professionalId,
                consultationTypeId,
                startsAt: window.startsAt,
                endsAt: window.endsAt,
                expiresAt,
              },
            },
            tx,
          );

          return created;
        },
      );

      return {
        id: hold.id,
        tenantId: hold.tenantId,
        patientId: hold.patientId,
        professionalId: hold.professionalId,
        consultationTypeId: hold.consultationTypeId,
        unitId: hold.unitId,
        room: hold.room,
        startsAt: hold.startsAt,
        endsAt: hold.endsAt,
        status: hold.status,
        expiresAt: hold.expiresAt,
        createdByUserId: hold.createdByUserId,
        createdAt: hold.createdAt,
        updatedAt: hold.updatedAt,
      };
    } catch (error) {
      if (isSchedulingOccupancyConflictError(error)) {
        throw new ConflictException("Requested slot is currently unavailable.");
      }

      throw error;
    }
  }

  private hasSimpleConflict(
    startsAt: Date,
    endsAt: Date,
    ranges: Array<{ startsAt: Date; endsAt: Date }>,
  ): boolean {
    return ranges.some(
      (range) =>
        startsAt.getTime() < range.endsAt.getTime() &&
        endsAt.getTime() > range.startsAt.getTime(),
    );
  }

  private hasAppointmentConflict(
    startsAt: Date,
    endsAt: Date,
    appointments: Array<{
      startsAt: Date;
      endsAt: Date;
      bufferBeforeMinutes: number;
      bufferAfterMinutes: number;
    }>,
  ): boolean {
    return appointments.some((appointment) => {
      const occupiedStartsAt = new Date(
        appointment.startsAt.getTime() - appointment.bufferBeforeMinutes * 60000,
      );
      const occupiedEndsAt = new Date(
        appointment.endsAt.getTime() + appointment.bufferAfterMinutes * 60000,
      );

      return (
        startsAt.getTime() < occupiedEndsAt.getTime() &&
        endsAt.getTime() > occupiedStartsAt.getTime()
      );
    });
  }

  private hasHoldConflict(
    startsAt: Date,
    endsAt: Date,
    holds: Array<{
      startsAt: Date;
      endsAt: Date;
      bufferBeforeMinutes: number;
      bufferAfterMinutes: number;
    }>,
  ): boolean {
    return holds.some((hold) => {
      const occupiedStartsAt = new Date(
        hold.startsAt.getTime() - hold.bufferBeforeMinutes * 60000,
      );
      const occupiedEndsAt = new Date(
        hold.endsAt.getTime() + hold.bufferAfterMinutes * 60000,
      );

      return (
        startsAt.getTime() < occupiedEndsAt.getTime() &&
        endsAt.getTime() > occupiedStartsAt.getTime()
      );
    });
  }

  private parseDateTime(value: string, fieldName: string): Date {
    return this.timezoneService.parseIsoInstant(value, fieldName);
  }

  private parseTtlMinutes(value: number | undefined): number {
    const ttl = value ?? 5;

    if (!Number.isInteger(ttl) || ttl < 1 || ttl > 30) {
      throw new BadRequestException("ttlMinutes must be an integer between 1 and 30.");
    }

    return ttl;
  }

  private normalizeRequiredId(value: string, fieldName: string): string {
    const normalized = value?.trim();

    if (!normalized) {
      throw new BadRequestException(`${fieldName} is required.`);
    }

    return normalized;
  }

  private normalizeOptionalText(
    value: string | undefined,
    maxLength: number,
    fieldName: string,
  ): string | null {
    if (value === undefined) {
      return null;
    }

    const normalized = value.trim();

    if (!normalized) {
      return null;
    }

    if (normalized.length > maxLength) {
      throw new BadRequestException(`${fieldName} exceeds max length ${maxLength}.`);
    }

    return normalized;
  }
}
