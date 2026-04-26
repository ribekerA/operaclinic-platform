import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, PrismaClient, ScheduleBlock } from "@prisma/client";
import { AuthenticatedUser } from "../../auth/interfaces/authenticated-user.interface";
import { AUDIT_ACTIONS } from "../../common/audit/audit.constants";
import { AuditService } from "../../common/audit/audit.service";
import { PrismaService } from "../../database/prisma.service";
import { CreateScheduleBlockDto } from "./dto/create-schedule-block.dto";
import { UpdateScheduleBlockDto } from "./dto/update-schedule-block.dto";
import { ScheduleBlockResponse } from "./interfaces/schedule-block.response";
import { SchedulingAccessService } from "./scheduling-access.service";
import { SchedulingConcurrencyService } from "./scheduling-concurrency.service";
import { SchedulingPoliciesService } from "./scheduling-policies.service";
import { SchedulingReferencesService } from "./scheduling-references.service";
import { SchedulingTimezoneService } from "./scheduling-timezone.service";

type DbClient = Prisma.TransactionClient | PrismaClient | PrismaService;

@Injectable()
export class ScheduleBlocksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accessService: SchedulingAccessService,
    private readonly concurrencyService: SchedulingConcurrencyService,
    private readonly policiesService: SchedulingPoliciesService,
    private readonly referencesService: SchedulingReferencesService,
    private readonly timezoneService: SchedulingTimezoneService,
    private readonly auditService: AuditService,
  ) {}

  async createBlock(
    actor: AuthenticatedUser,
    input: CreateScheduleBlockDto,
  ): Promise<ScheduleBlockResponse> {
    this.accessService.ensureAdminAccess(actor);
    const tenantId = this.accessService.resolveActiveTenantId(actor);

    const professionalId = this.normalizeRequiredId(input.professionalId, "professionalId");
    const unitId = this.normalizeOptionalId(input.unitId);
    const room = this.normalizeOptionalText(input.room, 80, "room");
    const reason = this.normalizeOptionalText(input.reason, 255, "reason");
    const startsAt = this.parseDateTime(input.startsAt, "startsAt");
    const endsAt = this.parseDateTime(input.endsAt, "endsAt");
    const isActive = input.isActive ?? true;

    this.assertDateRange(startsAt, endsAt);

    const created = await this.concurrencyService.runExclusiveForProfessional(
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
          await this.assertNoBlockConflict(
            {
              tenantId,
              professionalId,
              startsAt,
              endsAt,
              excludeBlockId: null,
            },
            tx,
          );

          await this.policiesService.assertNoActiveHoldConflict(
            {
              tenantId,
              professionalId,
              occupancyStartsAt: startsAt,
              occupancyEndsAt: endsAt,
              message: "Schedule block conflicts with active slot hold.",
            },
            tx,
          );

          await this.policiesService.assertNoAppointmentOccupancyConflict(
            {
              tenantId,
              professionalId,
              occupancyStartsAt: startsAt,
              occupancyEndsAt: endsAt,
              message: "Schedule block conflicts with existing appointment.",
            },
            tx,
          );
        }

        const block = await tx.scheduleBlock.create({
          data: {
            tenantId,
            professionalId,
            unitId,
            room,
            reason,
            startsAt,
            endsAt,
            isActive,
          },
        });

        await this.auditService.record(
          {
            action: AUDIT_ACTIONS.SCHEDULE_BLOCK_CREATED,
            actor,
            tenantId,
            targetType: "schedule_block",
            targetId: block.id,
            metadata: {
              professionalId,
              startsAt,
              endsAt,
              unitId,
            },
          },
          tx,
        );

        return block;
      },
    );

    return this.mapBlock(created);
  }

  async updateBlock(
    actor: AuthenticatedUser,
    blockId: string,
    input: UpdateScheduleBlockDto,
  ): Promise<ScheduleBlockResponse> {
    this.accessService.ensureAdminAccess(actor);
    const tenantId = this.accessService.resolveActiveTenantId(actor);

    const existing = await this.prisma.scheduleBlock.findFirst({
      where: {
        id: blockId,
        tenantId,
      },
      select: {
        professionalId: true,
      },
    });

    if (!existing) {
      throw new NotFoundException("Schedule block not found.");
    }

    const requestedProfessionalId =
      input.professionalId === undefined
        ? existing.professionalId
        : this.normalizeRequiredId(input.professionalId, "professionalId");

    const updated = await this.concurrencyService.runExclusiveForProfessionals(
      tenantId,
      [existing.professionalId, requestedProfessionalId],
      async (tx) => {
        const current = await tx.scheduleBlock.findFirst({
          where: {
            id: blockId,
            tenantId,
          },
        });

        if (!current) {
          throw new NotFoundException("Schedule block not found.");
        }

        const professionalId =
          input.professionalId === undefined
            ? current.professionalId
            : this.normalizeRequiredId(input.professionalId, "professionalId");
        const unitId =
          input.unitId === undefined
            ? current.unitId
            : this.normalizeOptionalId(input.unitId);
        const room =
          input.room === undefined
            ? current.room
            : this.normalizeOptionalText(input.room, 80, "room");
        const reason =
          input.reason === undefined
            ? current.reason
            : this.normalizeOptionalText(input.reason, 255, "reason");
        const startsAt =
          input.startsAt === undefined
            ? current.startsAt
            : this.parseDateTime(input.startsAt, "startsAt");
        const endsAt =
          input.endsAt === undefined
            ? current.endsAt
            : this.parseDateTime(input.endsAt, "endsAt");
        const isActive = input.isActive ?? current.isActive;

        this.assertDateRange(startsAt, endsAt);

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
          await this.assertNoBlockConflict(
            {
              tenantId,
              professionalId,
              startsAt,
              endsAt,
              excludeBlockId: blockId,
            },
            tx,
          );

          await this.policiesService.assertNoActiveHoldConflict(
            {
              tenantId,
              professionalId,
              occupancyStartsAt: startsAt,
              occupancyEndsAt: endsAt,
              message: "Schedule block conflicts with active slot hold.",
            },
            tx,
          );

          await this.policiesService.assertNoAppointmentOccupancyConflict(
            {
              tenantId,
              professionalId,
              occupancyStartsAt: startsAt,
              occupancyEndsAt: endsAt,
              message: "Schedule block conflicts with existing appointment.",
            },
            tx,
          );
        }

        const block = await tx.scheduleBlock.update({
          where: { id: blockId },
          data: {
            professionalId,
            unitId,
            room,
            reason,
            startsAt,
            endsAt,
            isActive,
          },
        });

        await this.auditService.record(
          {
            action: AUDIT_ACTIONS.SCHEDULE_BLOCK_UPDATED,
            actor,
            tenantId,
            targetType: "schedule_block",
            targetId: block.id,
            metadata: {
              professionalId,
              startsAt,
              endsAt,
              unitId,
              isActive,
            },
          },
          tx,
        );

        return block;
      },
    );

    return this.mapBlock(updated);
  }

  private async assertNoBlockConflict(
    input: {
      tenantId: string;
      professionalId: string;
      startsAt: Date;
      endsAt: Date;
      excludeBlockId: string | null;
    },
    dbClient: DbClient = this.prisma,
  ): Promise<void> {
    const conflict = await dbClient.scheduleBlock.findFirst({
      where: {
        tenantId: input.tenantId,
        professionalId: input.professionalId,
        isActive: true,
        startsAt: {
          lt: input.endsAt,
        },
        endsAt: {
          gt: input.startsAt,
        },
        ...(input.excludeBlockId
          ? {
              id: {
                not: input.excludeBlockId,
              },
            }
          : {}),
      },
      select: {
        id: true,
      },
    });

    if (conflict) {
      throw new ConflictException(
        "Schedule block overlaps with another active block.",
      );
    }
  }

  private assertDateRange(startsAt: Date, endsAt: Date): void {
    if (startsAt.getTime() >= endsAt.getTime()) {
      throw new BadRequestException("startsAt must be before endsAt.");
    }
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

  private parseDateTime(value: string, fieldName: string): Date {
    return this.timezoneService.parseIsoInstant(value, fieldName);
  }

  private mapBlock(block: ScheduleBlock): ScheduleBlockResponse {
    return {
      id: block.id,
      tenantId: block.tenantId,
      professionalId: block.professionalId,
      unitId: block.unitId ?? null,
      room: block.room ?? null,
      reason: block.reason ?? null,
      startsAt: block.startsAt,
      endsAt: block.endsAt,
      isActive: block.isActive,
      createdAt: block.createdAt,
      updatedAt: block.updatedAt,
    };
  }
}
