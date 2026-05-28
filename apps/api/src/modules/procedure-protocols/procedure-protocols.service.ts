import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { IsBoolean, IsInt, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";
import { AuthenticatedUser } from "../../auth/interfaces/authenticated-user.interface";
import { AUDIT_ACTIONS } from "../../common/audit/audit.constants";
import { AuditService } from "../../common/audit/audit.service";
import { PrismaService } from "../../database/prisma.service";

export class CreateProcedureProtocolDto {
  @IsString()
  consultationTypeId!: string;

  @IsString()
  @MaxLength(160)
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsInt()
  @Min(1)
  @Max(100)
  totalSessions!: number;

  @IsInt()
  @Min(0)
  @Max(365)
  intervalBetweenSessionsDays!: number;
}

export class UpdateProcedureProtocolDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  totalSessions?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(365)
  intervalBetweenSessionsDays?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

@Injectable()
export class ProcedureProtocolsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  private resolveTenantId(actor: AuthenticatedUser): string {
    const tenantId = actor.activeTenantId ?? actor.tenantId;
    if (!tenantId) throw new ForbiddenException("No active tenant");
    return tenantId;
  }

  async list(actor: AuthenticatedUser, activeOnly = true) {
    const tenantId = this.resolveTenantId(actor);
    return this.prisma.procedureProtocol.findMany({
      where: { tenantId, ...(activeOnly ? { isActive: true } : {}) },
      include: {
        consultationType: { select: { id: true, name: true, aestheticArea: true } },
        _count: { select: { patientInstances: true } },
      },
      orderBy: { name: "asc" },
    });
  }

  async findOne(actor: AuthenticatedUser, protocolId: string) {
    const tenantId = this.resolveTenantId(actor);
    const protocol = await this.prisma.procedureProtocol.findUnique({
      where: { id: protocolId },
      include: {
        consultationType: { select: { id: true, name: true, aestheticArea: true } },
        _count: { select: { patientInstances: true } },
      },
    });

    if (!protocol || protocol.tenantId !== tenantId) {
      throw new NotFoundException(`Protocol ${protocolId} not found`);
    }

    return protocol;
  }

  async create(actor: AuthenticatedUser, input: CreateProcedureProtocolDto) {
    const tenantId = this.resolveTenantId(actor);

    const existing = await this.prisma.procedureProtocol.findFirst({
      where: {
        tenantId,
        consultationTypeId: input.consultationTypeId,
        name: input.name,
      },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException(
        `A protocol named "${input.name}" already exists for this consultation type`,
      );
    }

    const protocol = await this.prisma.procedureProtocol.create({
      data: {
        tenantId,
        consultationTypeId: input.consultationTypeId,
        name: input.name,
        description: input.description ?? null,
        totalSessions: input.totalSessions,
        intervalBetweenSessionsDays: input.intervalBetweenSessionsDays,
        isActive: true,
      },
      include: {
        consultationType: { select: { id: true, name: true, aestheticArea: true } },
      },
    });

    await this.auditService.record({
      action: AUDIT_ACTIONS.PROCEDURE_PROTOCOL_CREATED,
      actor,
      tenantId,
      targetType: "ProcedureProtocol",
      targetId: protocol.id,
      metadata: { name: input.name, totalSessions: input.totalSessions },
    });

    return protocol;
  }

  async update(
    actor: AuthenticatedUser,
    protocolId: string,
    input: UpdateProcedureProtocolDto,
  ) {
    const tenantId = this.resolveTenantId(actor);
    await this.assertOwned(protocolId, tenantId);

    const protocol = await this.prisma.procedureProtocol.update({
      where: { id: protocolId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.totalSessions !== undefined ? { totalSessions: input.totalSessions } : {}),
        ...(input.intervalBetweenSessionsDays !== undefined
          ? { intervalBetweenSessionsDays: input.intervalBetweenSessionsDays }
          : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
      include: {
        consultationType: { select: { id: true, name: true, aestheticArea: true } },
        _count: { select: { patientInstances: true } },
      },
    });

    await this.auditService.record({
      action: AUDIT_ACTIONS.PROCEDURE_PROTOCOL_UPDATED,
      actor,
      tenantId,
      targetType: "ProcedureProtocol",
      targetId: protocol.id,
      metadata: input as Record<string, unknown>,
    });

    return protocol;
  }

  private async assertOwned(protocolId: string, tenantId: string) {
    const protocol = await this.prisma.procedureProtocol.findUnique({
      where: { id: protocolId },
      select: { id: true, tenantId: true },
    });

    if (!protocol || protocol.tenantId !== tenantId) {
      throw new NotFoundException(`Protocol ${protocolId} not found`);
    }
  }
}
