import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, ProtocolSessionStatus } from "@prisma/client";
import { IsEnum, IsOptional, IsString, IsUUID } from "class-validator";
import { AuthenticatedUser } from "../../auth/interfaces/authenticated-user.interface";
import { AUDIT_ACTIONS } from "../../common/audit/audit.constants";
import { AuditService } from "../../common/audit/audit.service";
import { PrismaService } from "../../database/prisma.service";
import { ClinicStructureAccessService } from "./clinic-structure-access.service";
import { CreateProcedureProtocolDto } from "./dto/create-procedure-protocol.dto";
import { ListProcedureProtocolsQueryDto } from "./dto/list-procedure-protocols-query.dto";
import { UpdateProcedureProtocolDto } from "./dto/update-procedure-protocol.dto";
import { ProcedureProtocolResponse } from "./interfaces/procedure-protocol.response";
import { PatientProtocolStatus } from "@prisma/client";

const procedureProtocolInclude = {
  consultationType: {
    select: {
      id: true,
      name: true,
    },
  },
} satisfies Prisma.ProcedureProtocolInclude;

type ProcedureProtocolWithRelations = Prisma.ProcedureProtocolGetPayload<{
  include: typeof procedureProtocolInclude;
}>;

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

@Injectable()
export class ProcedureProtocolsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accessService: ClinicStructureAccessService,
    private readonly auditService: AuditService,
  ) {}

  async listProcedureProtocols(
    actor: AuthenticatedUser,
    query: ListProcedureProtocolsQueryDto,
  ): Promise<ProcedureProtocolResponse[]> {
    const tenantId = this.accessService.resolveActiveTenantId(actor);

    const where: Prisma.ProcedureProtocolWhereInput = {
      tenantId,
      ...(query.consultationTypeId?.trim()
        ? { consultationTypeId: query.consultationTypeId.trim() }
        : {}),
      ...(query.isActive === undefined
        ? {}
        : {
            isActive: query.isActive.trim().toLowerCase() === "true",
          }),
    };

    const protocols = await this.prisma.procedureProtocol.findMany({
      where,
      include: procedureProtocolInclude,
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
    });

    return protocols.map((protocol) => this.mapProcedureProtocol(protocol));
  }

  async createProcedureProtocol(
    actor: AuthenticatedUser,
    input: CreateProcedureProtocolDto,
  ): Promise<ProcedureProtocolResponse> {
    this.accessService.ensureAdminAccess(actor);
    const tenantId = this.accessService.resolveActiveTenantId(actor);

    const consultationTypeId = this.normalizeRequiredId(
      input.consultationTypeId,
      "consultationTypeId",
    );
    const name = this.normalizeName(input.name, "name");

    await this.ensureConsultationTypeBelongsToTenant(consultationTypeId, tenantId);

    try {
      const protocol = await this.prisma.$transaction(async (tx) => {
        const created = await tx.procedureProtocol.create({
          data: {
            tenantId,
            consultationTypeId,
            name,
            description: this.normalizeOptionalText(input.description),
            totalSessions: this.parsePositiveInteger(input.totalSessions, "totalSessions"),
            intervalBetweenSessionsDays: this.parsePositiveInteger(
              input.intervalBetweenSessionsDays,
              "intervalBetweenSessionsDays",
            ),
            isActive: input.isActive ?? true,
          },
          include: procedureProtocolInclude,
        });

        await this.auditService.record(
          {
            action: AUDIT_ACTIONS.PROCEDURE_PROTOCOL_CREATED,
            actor,
            tenantId,
            targetType: "procedure_protocol",
            targetId: created.id,
            metadata: {
              consultationTypeId: created.consultationTypeId,
              totalSessions: created.totalSessions,
              intervalBetweenSessionsDays: created.intervalBetweenSessionsDays,
            },
          },
          tx,
        );

        return created;
      });

      return this.mapProcedureProtocol(protocol);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new ConflictException("Procedure protocol with this name already exists.");
      }

      throw error;
    }
  }

  async updateProcedureProtocol(
    actor: AuthenticatedUser,
    procedureProtocolId: string,
    input: UpdateProcedureProtocolDto,
  ): Promise<ProcedureProtocolResponse> {
    this.accessService.ensureAdminAccess(actor);
    const tenantId = this.accessService.resolveActiveTenantId(actor);

    const existing = await this.prisma.procedureProtocol.findFirst({
      where: {
        id: procedureProtocolId,
        tenantId,
      },
    });

    if (!existing) {
      throw new NotFoundException("Procedure protocol not found.");
    }

    const updateData: Prisma.ProcedureProtocolUpdateInput = {};

    if (typeof input.consultationTypeId === "string") {
      const consultationTypeId = this.normalizeRequiredId(
        input.consultationTypeId,
        "consultationTypeId",
      );
      await this.ensureConsultationTypeBelongsToTenant(consultationTypeId, tenantId);
      updateData.consultationType = {
        connect: {
          id: consultationTypeId,
        },
      };
    }

    if (typeof input.name === "string") {
      updateData.name = this.normalizeName(input.name, "name");
    }

    if (typeof input.description === "string") {
      updateData.description = this.normalizeOptionalText(input.description);
    }

    if (input.totalSessions !== undefined) {
      updateData.totalSessions = this.parsePositiveInteger(
        input.totalSessions,
        "totalSessions",
      );
    }

    if (input.intervalBetweenSessionsDays !== undefined) {
      updateData.intervalBetweenSessionsDays = this.parsePositiveInteger(
        input.intervalBetweenSessionsDays,
        "intervalBetweenSessionsDays",
      );
    }

    if (typeof input.isActive === "boolean") {
      updateData.isActive = input.isActive;
    }

    if (Object.keys(updateData).length === 0) {
      throw new BadRequestException("No valid fields were provided for update.");
    }

    try {
      const updated = await this.prisma.$transaction(async (tx) => {
        const protocol = await tx.procedureProtocol.update({
          where: { id: procedureProtocolId },
          data: updateData,
          include: procedureProtocolInclude,
        });

        await this.auditService.record(
          {
            action: AUDIT_ACTIONS.PROCEDURE_PROTOCOL_UPDATED,
            actor,
            tenantId,
            targetType: "procedure_protocol",
            targetId: protocol.id,
            metadata: {
              updatedFields: Object.keys(updateData),
            },
          },
          tx,
        );

        return protocol;
      });

      return this.mapProcedureProtocol(updated);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new ConflictException("Procedure protocol with this name already exists.");
      }

      throw error;
    }
  }

  private async ensureConsultationTypeBelongsToTenant(
    consultationTypeId: string,
    tenantId: string,
  ): Promise<void> {
    const consultationType = await this.prisma.consultationType.findFirst({
      where: {
        id: consultationTypeId,
        tenantId,
      },
      select: { id: true },
    });

    if (!consultationType) {
      throw new NotFoundException("Consultation type not found.");
    }
  }

  private normalizeRequiredId(value: string, field: string): string {
    const normalized = value?.trim();

    if (!normalized) {
      throw new BadRequestException(`${field} is required.`);
    }

    return normalized;
  }

  private normalizeName(value: string, field: string): string {
    const normalized = value?.trim();

    if (!normalized) {
      throw new BadRequestException(`${field} is required.`);
    }

    return normalized;
  }

  private normalizeOptionalText(value?: string): string | null {
    if (typeof value !== "string") {
      return null;
    }

    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
  }

  private parsePositiveInteger(value: unknown, field: string): number {
    const numeric = Number(value);

    if (!Number.isInteger(numeric) || numeric <= 0) {
      throw new BadRequestException(`${field} must be an integer > 0.`);
    }

    return numeric;
  }

  private mapProcedureProtocol(
    protocol: ProcedureProtocolWithRelations,
  ): ProcedureProtocolResponse {
    return {
      id: protocol.id,
      tenantId: protocol.tenantId,
      consultationTypeId: protocol.consultationTypeId,
      consultationTypeName: protocol.consultationType.name,
      name: protocol.name,
      description: protocol.description,
      totalSessions: protocol.totalSessions,
      intervalBetweenSessionsDays: protocol.intervalBetweenSessionsDays,
      isActive: protocol.isActive,
      createdAt: protocol.createdAt,
      updatedAt: protocol.updatedAt,
    };
  }

  // Single protocol lookup (by id, not filtered to active-only)

  async findOne(actor: AuthenticatedUser, protocolId: string) {
    const tenantId = this.accessService.resolveActiveTenantId(actor);
    const protocol = await this.prisma.procedureProtocol.findUnique({
      where: { id: protocolId },
      include: procedureProtocolInclude,
    });

    if (!protocol || protocol.tenantId !== tenantId) {
      throw new NotFoundException(`Protocol ${protocolId} not found`);
    }

    return this.mapProcedureProtocol(protocol);
  }

  // Patient protocol instances

  async enrollPatient(actor: AuthenticatedUser, input: EnrollPatientInProtocolDto) {
    const tenantId = this.accessService.resolveActiveTenantId(actor);

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
    const tenantId = this.accessService.resolveActiveTenantId(actor);

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
    const tenantId = this.accessService.resolveActiveTenantId(actor);

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
    const tenantId = this.accessService.resolveActiveTenantId(actor);
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
    const tenantId = this.accessService.resolveActiveTenantId(actor);

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

      const newStatus =
        completed === allSessions ? "COMPLETED" : notPending === allSessions ? "ABANDONED" : undefined;

      await this.prisma.patientProtocolInstance.update({
        where: { id: instanceId },
        data: {
          sessionsCompleted: completed,
          ...(newStatus
            ? { status: newStatus, completedAt: newStatus === "COMPLETED" ? new Date() : undefined }
            : {}),
        },
      });
    }

    return updated;
  }
}
