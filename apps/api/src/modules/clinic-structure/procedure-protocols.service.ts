import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { AuthenticatedUser } from "../../auth/interfaces/authenticated-user.interface";
import { AUDIT_ACTIONS } from "../../common/audit/audit.constants";
import { AuditService } from "../../common/audit/audit.service";
import { PrismaService } from "../../database/prisma.service";
import { ClinicStructureAccessService } from "./clinic-structure-access.service";
import { CreateProcedureProtocolDto } from "./dto/create-procedure-protocol.dto";
import { ListProcedureProtocolsQueryDto } from "./dto/list-procedure-protocols-query.dto";
import { UpdateProcedureProtocolDto } from "./dto/update-procedure-protocol.dto";
import { ProcedureProtocolResponse } from "./interfaces/procedure-protocol.response";

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
}
