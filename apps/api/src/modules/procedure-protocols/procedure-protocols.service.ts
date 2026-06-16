import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from "class-validator";
import { PatientProtocolStatus, ProtocolSessionStatus } from "@prisma/client";
import { AuthenticatedUser } from "../../auth/interfaces/authenticated-user.interface";
import { AUDIT_ACTIONS } from "../../common/audit/audit.constants";
import { AuditService } from "../../common/audit/audit.service";
import { PrismaService } from "../../database/prisma.service";

export class EnrollPatientInProtocolDto {
  @IsUUID()
  patientId!: string;

  @IsUUID()
  procedureProtocolId!: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateProtocolInstanceDto {
  @IsOptional()
  @IsEnum(PatientProtocolStatus)
  status?: PatientProtocolStatus;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateProtocolSessionDto {
  @IsEnum(ProtocolSessionStatus)
  status!: ProtocolSessionStatus;

  @IsOptional()
  @IsString()
  canceledReason?: string;

  @IsOptional()
  @IsString()
  skippedReason?: string;
}

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
    const tenantId = actor.activeTenantId ?? actor.tenantIds?.[0];
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
      metadata: input as unknown as import("@prisma/client").Prisma.InputJsonValue,
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

  async enrollPatient(actor: AuthenticatedUser, input: EnrollPatientInProtocolDto) {
    const tenantId = this.resolveTenantId(actor);

    const protocol = await this.prisma.procedureProtocol.findFirst({
      where: { id: input.procedureProtocolId, tenantId, isActive: true },
      select: { id: true, totalSessions: true, intervalBetweenSessionsDays: true, name: true },
    });
    if (!protocol) throw new NotFoundException("Protocolo não encontrado.");

    const patient = await this.prisma.patient.findFirst({
      where: { id: input.patientId, tenantId },
      select: { id: true },
    });
    if (!patient) throw new NotFoundException("Paciente não encontrado.");

    const existing = await this.prisma.patientProtocolInstance.findUnique({
      where: {
        patientId_procedureProtocolId: {
          patientId: input.patientId,
          procedureProtocolId: input.procedureProtocolId,
        },
      },
      select: { id: true, status: true },
    });

    if (existing && existing.status === "ACTIVE") {
      throw new ConflictException("Paciente já está inscrito neste protocolo.");
    }

    const now = new Date();
    const expectedCompletionAt = new Date(now);
    expectedCompletionAt.setDate(
      now.getDate() + protocol.totalSessions * protocol.intervalBetweenSessionsDays,
    );

    const instance = await this.prisma.$transaction(async (tx) => {
      const created = await tx.patientProtocolInstance.create({
        data: {
          tenantId,
          patientId: input.patientId,
          procedureProtocolId: input.procedureProtocolId,
          status: "ACTIVE",
          sessionsPlanned: protocol.totalSessions,
          sessionsScheduled: 0,
          sessionsCompleted: 0,
          startedAt: now,
          expectedCompletionAt,
          notes: input.notes ?? null,
        },
      });

      // Create session records
      const sessions = Array.from({ length: protocol.totalSessions }, (_, i) => {
        const plannedDate = new Date(now);
        plannedDate.setDate(now.getDate() + i * protocol.intervalBetweenSessionsDays);
        return {
          tenantId,
          patientProtocolInstanceId: created.id,
          procedureProtocolId: input.procedureProtocolId,
          sessionSequence: i + 1,
          status: "PLANNED" as ProtocolSessionStatus,
          plannedStartDate: plannedDate,
        };
      });

      await tx.protocolSessionAppointment.createMany({ data: sessions });

      return created;
    });

    await this.auditService.record({
      action: AUDIT_ACTIONS.PROCEDURE_PROTOCOL_CREATED,
      actor,
      tenantId,
      targetType: "PatientProtocolInstance",
      targetId: instance.id,
      metadata: { patientId: input.patientId, protocolName: protocol.name },
    });

    return this.getPatientInstance(actor, instance.id);
  }

  async getPatientInstance(actor: AuthenticatedUser, instanceId: string) {
    const tenantId = this.resolveTenantId(actor);

    const instance = await this.prisma.patientProtocolInstance.findUnique({
      where: { id: instanceId },
      include: {
        procedureProtocol: {
          select: { id: true, name: true, totalSessions: true, intervalBetweenSessionsDays: true },
        },
        patient: { select: { id: true, fullName: true } },
        sessionAppointments: {
          orderBy: { sessionSequence: "asc" },
          include: {
            appointment: {
              select: { id: true, startsAt: true, status: true },
            },
          },
        },
      },
    });

    if (!instance || instance.tenantId !== tenantId) {
      throw new NotFoundException("Instância de protocolo não encontrada.");
    }

    return instance;
  }

  async listPatientInstances(actor: AuthenticatedUser, patientId: string) {
    const tenantId = this.resolveTenantId(actor);

    const patient = await this.prisma.patient.findFirst({
      where: { id: patientId, tenantId },
      select: { id: true },
    });
    if (!patient) throw new NotFoundException("Paciente não encontrado.");

    return this.prisma.patientProtocolInstance.findMany({
      where: { patientId, tenantId },
      include: {
        procedureProtocol: {
          select: {
            id: true,
            name: true,
            totalSessions: true,
            intervalBetweenSessionsDays: true,
            consultationType: { select: { id: true, name: true } },
          },
        },
        sessionAppointments: {
          orderBy: { sessionSequence: "asc" },
          select: { sessionSequence: true, status: true, plannedStartDate: true },
        },
      },
      orderBy: { startedAt: "desc" },
    });
  }

  async updatePatientInstance(
    actor: AuthenticatedUser,
    instanceId: string,
    input: UpdateProtocolInstanceDto,
  ) {
    const tenantId = this.resolveTenantId(actor);
    const instance = await this.prisma.patientProtocolInstance.findUnique({
      where: { id: instanceId },
      select: { id: true, tenantId: true, status: true },
    });

    if (!instance || instance.tenantId !== tenantId) {
      throw new NotFoundException("Instância de protocolo não encontrada.");
    }

    const data: Record<string, unknown> = {};
    if (input.notes !== undefined) data.notes = input.notes;
    if (input.status !== undefined) {
      data.status = input.status;
      if (input.status === "COMPLETED") data.completedAt = new Date();
      if (input.status === "ABANDONED") data.abandonedAt = new Date();
    }

    await this.prisma.patientProtocolInstance.update({
      where: { id: instanceId },
      data,
    });

    return this.getPatientInstance(actor, instanceId);
  }

  async updateProtocolSession(
    actor: AuthenticatedUser,
    instanceId: string,
    sessionSequence: number,
    input: UpdateProtocolSessionDto,
  ) {
    const tenantId = this.resolveTenantId(actor);

    const session = await this.prisma.protocolSessionAppointment.findFirst({
      where: { patientProtocolInstanceId: instanceId, sessionSequence },
      include: { patientProtocolInstance: { select: { tenantId: true } } },
    });

    if (!session || session.patientProtocolInstance.tenantId !== tenantId) {
      throw new NotFoundException("Sessão não encontrada.");
    }

    const updated = await this.prisma.protocolSessionAppointment.update({
      where: { id: session.id },
      data: {
        status: input.status,
        canceledReason: input.canceledReason ?? null,
        skippedReason: input.skippedReason ?? null,
      },
    });

    // Recalculate sessionsCompleted on the instance
    if (input.status === "COMPLETED" || input.status === "CANCELED" || input.status === "SKIPPED") {
      const [completed, allSessions] = await Promise.all([
        this.prisma.protocolSessionAppointment.count({
          where: { patientProtocolInstanceId: instanceId, status: "COMPLETED" },
        }),
        this.prisma.protocolSessionAppointment.count({
          where: { patientProtocolInstanceId: instanceId },
        }),
      ]);

      const notPending = await this.prisma.protocolSessionAppointment.count({
        where: {
          patientProtocolInstanceId: instanceId,
          status: { in: ["COMPLETED", "CANCELED", "SKIPPED"] },
        },
      });

      const newStatus = completed === allSessions ? "COMPLETED" : notPending === allSessions ? "ABANDONED" : undefined;

      await this.prisma.patientProtocolInstance.update({
        where: { id: instanceId },
        data: {
          sessionsCompleted: completed,
          ...(newStatus ? { status: newStatus, completedAt: newStatus === "COMPLETED" ? new Date() : undefined } : {}),
        },
      });
    }

    return updated;
  }
}
