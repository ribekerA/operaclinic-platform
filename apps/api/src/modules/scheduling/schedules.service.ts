import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  Prisma,
  PrismaClient,
  ProfessionalSchedule,
  ScheduleDayOfWeek,
} from "@prisma/client";
import { AuthenticatedUser } from "../../auth/interfaces/authenticated-user.interface";
import { AUDIT_ACTIONS } from "../../common/audit/audit.constants";
import { AuditService } from "../../common/audit/audit.service";
import { PrismaService } from "../../database/prisma.service";
import { CreateScheduleDto } from "./dto/create-schedule.dto";
import { UpdateScheduleDto } from "./dto/update-schedule.dto";
import { ScheduleResponse } from "./interfaces/schedule.response";
import { SchedulingAccessService } from "./scheduling-access.service";
import { SchedulingConcurrencyService } from "./scheduling-concurrency.service";
import { SchedulingReferencesService } from "./scheduling-references.service";

type DbClient = Prisma.TransactionClient | PrismaClient | PrismaService;

@Injectable()
export class SchedulesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accessService: SchedulingAccessService,
    private readonly concurrencyService: SchedulingConcurrencyService,
    private readonly referencesService: SchedulingReferencesService,
    private readonly auditService: AuditService,
  ) {}

  async createSchedule(
    actor: AuthenticatedUser,
    input: CreateScheduleDto,
  ): Promise<ScheduleResponse> {
    this.accessService.ensureAdminAccess(actor);
    const tenantId = this.accessService.resolveActiveTenantId(actor);

    const professionalId = this.normalizeRequiredId(input.professionalId, "professionalId");
    const dayOfWeek = this.parseDayOfWeek(input.dayOfWeek);
    const startTime = this.parseTimeOfDay(input.startTime, "startTime");
    const endTime = this.parseTimeOfDay(input.endTime, "endTime");
    const slotIntervalMinutes = this.parseSlotInterval(input.slotIntervalMinutes);
    const unitId = this.normalizeOptionalId(input.unitId);
    const validFrom = input.validFrom
      ? this.parseDateOnly(input.validFrom, "validFrom")
      : null;
    const validTo = input.validTo
      ? this.parseDateOnly(input.validTo, "validTo")
      : null;
    const isActive = input.isActive ?? true;

    this.assertTimeRange(startTime, endTime);
    this.assertValidityRange(validFrom, validTo);

    const schedule = await this.concurrencyService.runExclusiveForProfessional(
      tenantId,
      professionalId,
      async (tx) => {
        await this.referencesService.assertProfessionalBelongsToTenant(
          professionalId,
          tenantId,
          {},
          tx,
        );
        await this.referencesService.assertUnitBelongsToTenant(unitId, tenantId, tx);
        await this.referencesService.assertProfessionalAssignedToUnit(
          professionalId,
          unitId,
          tenantId,
          tx,
        );

        if (isActive) {
          await this.assertNoOverlappingSchedule(
            {
              tenantId,
              professionalId,
              dayOfWeek,
              startTime,
              endTime,
              validFrom,
              validTo,
              excludeScheduleId: null,
            },
            tx,
          );
        }

        const created = await tx.professionalSchedule.create({
          data: {
            tenantId,
            professionalId,
            dayOfWeek,
            startTime,
            endTime,
            slotIntervalMinutes,
            unitId,
            validFrom,
            validTo,
            isActive,
          },
        });

        await this.auditService.record(
          {
            action: AUDIT_ACTIONS.SCHEDULE_CREATED,
            actor,
            tenantId,
            targetType: "professional_schedule",
            targetId: created.id,
            metadata: {
              professionalId,
              dayOfWeek,
              unitId,
              slotIntervalMinutes,
            },
          },
          tx,
        );

        return created;
      },
    );

    return this.mapSchedule(schedule);
  }

  async updateSchedule(
    actor: AuthenticatedUser,
    scheduleId: string,
    input: UpdateScheduleDto,
  ): Promise<ScheduleResponse> {
    this.accessService.ensureAdminAccess(actor);
    const tenantId = this.accessService.resolveActiveTenantId(actor);

    const existing = await this.prisma.professionalSchedule.findFirst({
      where: {
        id: scheduleId,
        tenantId,
      },
      select: {
        professionalId: true,
      },
    });

    if (!existing) {
      throw new NotFoundException("Schedule not found.");
    }

    const requestedProfessionalId =
      input.professionalId === undefined
        ? existing.professionalId
        : this.normalizeRequiredId(input.professionalId, "professionalId");

    const updated = await this.concurrencyService.runExclusiveForProfessionals(
      tenantId,
      [existing.professionalId, requestedProfessionalId],
      async (tx) => {
        const current = await tx.professionalSchedule.findFirst({
          where: {
            id: scheduleId,
            tenantId,
          },
        });

        if (!current) {
          throw new NotFoundException("Schedule not found.");
        }

        const professionalId =
          input.professionalId === undefined
            ? current.professionalId
            : this.normalizeRequiredId(input.professionalId, "professionalId");
        const dayOfWeek =
          input.dayOfWeek === undefined
            ? current.dayOfWeek
            : this.parseDayOfWeek(input.dayOfWeek);
        const startTime =
          input.startTime === undefined
            ? current.startTime
            : this.parseTimeOfDay(input.startTime, "startTime");
        const endTime =
          input.endTime === undefined
            ? current.endTime
            : this.parseTimeOfDay(input.endTime, "endTime");
        const slotIntervalMinutes =
          input.slotIntervalMinutes === undefined
            ? current.slotIntervalMinutes
            : this.parseSlotInterval(input.slotIntervalMinutes);
        const unitId =
          input.unitId === undefined
            ? current.unitId
            : this.normalizeOptionalId(input.unitId);
        const validFrom =
          input.validFrom === undefined
            ? current.validFrom
            : input.validFrom
              ? this.parseDateOnly(input.validFrom, "validFrom")
              : null;
        const validTo =
          input.validTo === undefined
            ? current.validTo
            : input.validTo
              ? this.parseDateOnly(input.validTo, "validTo")
              : null;
        const isActive = input.isActive ?? current.isActive;

        this.assertTimeRange(startTime, endTime);
        this.assertValidityRange(validFrom, validTo);

        await this.referencesService.assertProfessionalBelongsToTenant(
          professionalId,
          tenantId,
          {},
          tx,
        );
        await this.referencesService.assertUnitBelongsToTenant(unitId, tenantId, tx);
        await this.referencesService.assertProfessionalAssignedToUnit(
          professionalId,
          unitId,
          tenantId,
          tx,
        );

        if (isActive) {
          await this.assertNoOverlappingSchedule(
            {
              tenantId,
              professionalId,
              dayOfWeek,
              startTime,
              endTime,
              validFrom,
              validTo,
              excludeScheduleId: scheduleId,
            },
            tx,
          );
        }

        const result = await tx.professionalSchedule.update({
          where: { id: scheduleId },
          data: {
            professionalId,
            dayOfWeek,
            startTime,
            endTime,
            slotIntervalMinutes,
            unitId,
            validFrom,
            validTo,
            isActive,
          },
        });

        await this.auditService.record(
          {
            action: AUDIT_ACTIONS.SCHEDULE_UPDATED,
            actor,
            tenantId,
            targetType: "professional_schedule",
            targetId: result.id,
            metadata: {
              professionalId,
              dayOfWeek,
              unitId,
              slotIntervalMinutes,
              isActive,
            },
          },
          tx,
        );

        return result;
      },
    );

    return this.mapSchedule(updated);
  }

  private async assertNoOverlappingSchedule(
    input: {
      tenantId: string;
      professionalId: string;
      dayOfWeek: ScheduleDayOfWeek;
      startTime: Date;
      endTime: Date;
      validFrom: Date | null;
      validTo: Date | null;
      excludeScheduleId: string | null;
    },
    dbClient: DbClient = this.prisma,
  ): Promise<void> {
    const existingSchedules = await dbClient.professionalSchedule.findMany({
      where: {
        tenantId: input.tenantId,
        professionalId: input.professionalId,
        dayOfWeek: input.dayOfWeek,
        isActive: true,
        ...(input.excludeScheduleId
          ? {
              id: {
                not: input.excludeScheduleId,
              },
            }
          : {}),
      },
      select: {
        id: true,
        startTime: true,
        endTime: true,
        validFrom: true,
        validTo: true,
      },
    });

    const startMinutes = this.toMinutes(input.startTime);
    const endMinutes = this.toMinutes(input.endTime);

    for (const schedule of existingSchedules) {
      const existingStartMinutes = this.toMinutes(schedule.startTime);
      const existingEndMinutes = this.toMinutes(schedule.endTime);

      const timeOverlaps =
        startMinutes < existingEndMinutes && endMinutes > existingStartMinutes;

      if (!timeOverlaps) {
        continue;
      }

      const datesOverlap = this.dateRangesOverlap(
        input.validFrom,
        input.validTo,
        schedule.validFrom,
        schedule.validTo,
      );

      if (datesOverlap) {
        throw new ConflictException(
          "Schedule overlaps with an existing active schedule for this professional.",
        );
      }
    }
  }

  private parseDayOfWeek(value: string): ScheduleDayOfWeek {
    if ((Object.values(ScheduleDayOfWeek) as string[]).includes(value)) {
      return value as ScheduleDayOfWeek;
    }

    throw new BadRequestException("Invalid dayOfWeek.");
  }

  private parseTimeOfDay(value: string, fieldName: string): Date {
    const normalized = value?.trim();

    if (!normalized) {
      throw new BadRequestException(`${fieldName} is required.`);
    }

    const match = /^(\d{2}):(\d{2})$/.exec(normalized);

    if (!match) {
      throw new BadRequestException(`${fieldName} must be in HH:mm format.`);
    }

    const hour = Number.parseInt(match[1], 10);
    const minute = Number.parseInt(match[2], 10);

    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
      throw new BadRequestException(`${fieldName} has invalid hour/minute.`);
    }

    return new Date(Date.UTC(1970, 0, 1, hour, minute, 0, 0));
  }

  private parseDateOnly(value: string, fieldName: string): Date {
    const normalized = value.trim();

    if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
      throw new BadRequestException(`${fieldName} must be in YYYY-MM-DD format.`);
    }

    const parsed = new Date(`${normalized}T00:00:00.000Z`);

    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(`${fieldName} is invalid.`);
    }

    return parsed;
  }

  private normalizeRequiredId(value: string, fieldName: string): string {
    const normalized = value?.trim();

    if (!normalized) {
      throw new BadRequestException(`${fieldName} is required.`);
    }

    return normalized;
  }

  private normalizeOptionalId(value: string | undefined): string | null {
    if (value === undefined) {
      return null;
    }

    const normalized = value.trim();

    return normalized || null;
  }

  private parseSlotInterval(value: number | undefined): number {
    const parsed = value ?? 15;

    if (!Number.isInteger(parsed) || parsed < 5 || parsed > 120) {
      throw new BadRequestException(
        "slotIntervalMinutes must be an integer between 5 and 120.",
      );
    }

    return parsed;
  }

  private assertTimeRange(startTime: Date, endTime: Date): void {
    if (this.toMinutes(startTime) >= this.toMinutes(endTime)) {
      throw new BadRequestException("startTime must be before endTime.");
    }
  }

  private assertValidityRange(validFrom: Date | null, validTo: Date | null): void {
    if (validFrom && validTo && validFrom.getTime() > validTo.getTime()) {
      throw new BadRequestException("validFrom cannot be after validTo.");
    }
  }

  private toMinutes(time: Date): number {
    return time.getUTCHours() * 60 + time.getUTCMinutes();
  }

  private dateRangesOverlap(
    leftStart: Date | null,
    leftEnd: Date | null,
    rightStart: Date | null,
    rightEnd: Date | null,
  ): boolean {
    const minDate = new Date("1900-01-01T00:00:00.000Z");
    const maxDate = new Date("9999-12-31T00:00:00.000Z");

    const normalizedLeftStart = leftStart ?? minDate;
    const normalizedLeftEnd = leftEnd ?? maxDate;
    const normalizedRightStart = rightStart ?? minDate;
    const normalizedRightEnd = rightEnd ?? maxDate;

    return (
      normalizedLeftStart.getTime() <= normalizedRightEnd.getTime() &&
      normalizedRightStart.getTime() <= normalizedLeftEnd.getTime()
    );
  }

  private formatTime(time: Date): string {
    const hours = String(time.getUTCHours()).padStart(2, "0");
    const minutes = String(time.getUTCMinutes()).padStart(2, "0");

    return `${hours}:${minutes}`;
  }

  private mapSchedule(schedule: ProfessionalSchedule): ScheduleResponse {
    return {
      id: schedule.id,
      tenantId: schedule.tenantId,
      professionalId: schedule.professionalId,
      unitId: schedule.unitId ?? null,
      dayOfWeek: schedule.dayOfWeek,
      startTime: this.formatTime(schedule.startTime),
      endTime: this.formatTime(schedule.endTime),
      slotIntervalMinutes: schedule.slotIntervalMinutes,
      isActive: schedule.isActive,
      validFrom: schedule.validFrom,
      validTo: schedule.validTo,
      createdAt: schedule.createdAt,
      updatedAt: schedule.updatedAt,
    };
  }
}
