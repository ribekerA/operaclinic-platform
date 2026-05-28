import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from "@nestjs/common";
import { WaitlistStatus } from "@prisma/client";
import { IsEnum, IsISO8601, IsOptional, IsString, MaxLength } from "class-validator";
import { AuthenticatedUser } from "../../auth/interfaces/authenticated-user.interface";
import { AUDIT_ACTIONS } from "../../common/audit/audit.constants";
import { AuditService } from "../../common/audit/audit.service";
import { PrismaService } from "../../database/prisma.service";
import { SchedulingAccessService } from "./scheduling-access.service";

export class CreateWaitlistEntryDto {
  @IsString()
  patientId!: string;

  @IsOptional()
  @IsString()
  professionalId?: string;

  @IsOptional()
  @IsString()
  consultationTypeId?: string;

  @IsOptional()
  @IsString()
  unitId?: string;

  @IsOptional()
  @IsISO8601()
  preferredDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  note?: string;
}

export class UpdateWaitlistStatusDto {
  @IsEnum(WaitlistStatus)
  status!: WaitlistStatus;
}

@Injectable()
export class WaitlistService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accessService: SchedulingAccessService,
    private readonly auditService: AuditService,
  ) {}

  async list(actor: AuthenticatedUser, statusFilter?: WaitlistStatus) {
    const tenantId = this.accessService.resolveActiveTenantId(actor);

    return this.prisma.waitlist.findMany({
      where: {
        tenantId,
        ...(statusFilter ? { status: statusFilter } : {}),
      },
      include: {
        patient: { select: { id: true, fullName: true } },
        professional: { select: { id: true, displayName: true } },
        consultationType: { select: { id: true, name: true } },
        unit: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "asc" },
    });
  }

  async create(actor: AuthenticatedUser, input: CreateWaitlistEntryDto) {
    const tenantId = this.accessService.resolveActiveTenantId(actor);

    const entry = await this.prisma.waitlist.create({
      data: {
        tenantId,
        patientId: input.patientId,
        professionalId: input.professionalId ?? null,
        consultationTypeId: input.consultationTypeId ?? null,
        unitId: input.unitId ?? null,
        preferredDate: input.preferredDate ? new Date(input.preferredDate) : null,
        note: input.note ?? null,
        status: WaitlistStatus.OPEN,
      },
      include: {
        patient: { select: { id: true, fullName: true } },
        professional: { select: { id: true, displayName: true } },
        consultationType: { select: { id: true, name: true } },
        unit: { select: { id: true, name: true } },
      },
    });

    await this.auditService.record({
      action: AUDIT_ACTIONS.WAITLIST_ENTRY_CREATED,
      actor,
      tenantId,
      targetType: "Waitlist",
      targetId: entry.id,
      metadata: { patientId: input.patientId },
    });

    return entry;
  }

  async updateStatus(
    actor: AuthenticatedUser,
    entryId: string,
    status: WaitlistStatus,
  ) {
    const tenantId = this.accessService.resolveActiveTenantId(actor);
    const entry = await this.findOwnedEntry(entryId, tenantId);

    const updated = await this.prisma.waitlist.update({
      where: { id: entry.id },
      data: { status },
      include: {
        patient: { select: { id: true, fullName: true } },
        professional: { select: { id: true, displayName: true } },
        consultationType: { select: { id: true, name: true } },
        unit: { select: { id: true, name: true } },
      },
    });

    await this.auditService.record({
      action: AUDIT_ACTIONS.WAITLIST_STATUS_UPDATED,
      actor,
      tenantId,
      targetType: "Waitlist",
      targetId: entry.id,
      metadata: { status },
    });

    return updated;
  }

  async remove(actor: AuthenticatedUser, entryId: string) {
    const tenantId = this.accessService.resolveActiveTenantId(actor);
    const entry = await this.findOwnedEntry(entryId, tenantId);

    await this.prisma.waitlist.delete({ where: { id: entry.id } });

    await this.auditService.record({
      action: AUDIT_ACTIONS.WAITLIST_ENTRY_DELETED,
      actor,
      tenantId,
      targetType: "Waitlist",
      targetId: entry.id,
      metadata: {},
    });
  }

  private async findOwnedEntry(entryId: string, tenantId: string) {
    const entry = await this.prisma.waitlist.findUnique({
      where: { id: entryId },
      select: { id: true, tenantId: true },
    });

    if (!entry) {
      throw new NotFoundException(`Waitlist entry ${entryId} not found`);
    }

    if (entry.tenantId !== tenantId) {
      throw new ForbiddenException("Access denied to this waitlist entry");
    }

    return entry;
  }
}
