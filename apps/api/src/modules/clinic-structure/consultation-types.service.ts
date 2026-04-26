import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { AestheticArea, InvasivenessLevel, Prisma } from "@prisma/client";
import { AuthenticatedUser } from "../../auth/interfaces/authenticated-user.interface";
import { AUDIT_ACTIONS } from "../../common/audit/audit.constants";
import { MAX_CONSULTATION_BUFFER_MINUTES } from "../../common/constants/clinic.constants";
import { AuditService } from "../../common/audit/audit.service";
import { PrismaService } from "../../database/prisma.service";
import { ClinicStructureAccessService } from "./clinic-structure-access.service";
import { CreateConsultationTypeDto } from "./dto/create-consultation-type.dto";
import { UpdateConsultationTypeDto } from "./dto/update-consultation-type.dto";
import { ConsultationTypeResponse } from "./interfaces/consultation-type.response";

@Injectable()
export class ConsultationTypesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accessService: ClinicStructureAccessService,
    private readonly auditService: AuditService,
  ) {}

  async listConsultationTypes(
    actor: AuthenticatedUser,
  ): Promise<ConsultationTypeResponse[]> {
    const tenantId = this.accessService.resolveActiveTenantId(actor);

    const consultationTypes = await this.prisma.consultationType.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
    });

    return consultationTypes.map((consultationType) =>
      this.mapConsultationType(consultationType),
    );
  }

  async createConsultationType(
    actor: AuthenticatedUser,
    input: CreateConsultationTypeDto,
  ): Promise<ConsultationTypeResponse> {
    this.accessService.ensureAdminAccess(actor);
    const tenantId = this.accessService.resolveActiveTenantId(actor);

    const name = input.name?.trim();

    if (!name) {
      throw new BadRequestException("name is required.");
    }

    const durationMinutes = this.parseDuration(input.durationMinutes);
    const bufferBeforeMinutes = this.parseBuffer(
      input.bufferBeforeMinutes,
      "bufferBeforeMinutes",
      0,
    );
    const bufferAfterMinutes = this.parseBuffer(
      input.bufferAfterMinutes,
      "bufferAfterMinutes",
      0,
    );
    const aestheticArea = this.parseAestheticArea(input.aestheticArea);
    const invasivenessLevel = this.parseInvasivenessLevel(input.invasivenessLevel);
    const recoveryDays = this.parseOptionalMetric(input.recoveryDays, "recoveryDays");
    const recommendedFrequencyDays = this.parseOptionalMetric(
      input.recommendedFrequencyDays,
      "recommendedFrequencyDays",
    );
    const preparationNotes = this.parseOptionalText(input.preparationNotes);
    const contraindications = this.parseOptionalText(input.contraindications);
    const aftercareGuidance = this.parseOptionalText(input.aftercareGuidance);

    try {
      const consultationType = await this.prisma.$transaction(async (tx) => {
        const created = await tx.consultationType.create({
          data: {
            tenantId,
            name,
            durationMinutes,
            bufferBeforeMinutes,
            bufferAfterMinutes,
            isFirstVisit: input.isFirstVisit ?? false,
            isReturnVisit: input.isReturnVisit ?? false,
            isOnline: input.isOnline ?? false,
            isActive: input.isActive ?? true,
            aestheticArea,
            invasivenessLevel,
            recoveryDays,
            recommendedFrequencyDays,
            preparationNotes,
            contraindications,
            aftercareGuidance,
          },
        });

        await this.auditService.record(
          {
            action: AUDIT_ACTIONS.CONSULTATION_TYPE_CREATED,
            actor,
            tenantId,
            targetType: "consultation_type",
            targetId: created.id,
            metadata: {
              durationMinutes: created.durationMinutes,
              bufferBeforeMinutes: created.bufferBeforeMinutes,
              bufferAfterMinutes: created.bufferAfterMinutes,
              isOnline: created.isOnline,
              aestheticArea: created.aestheticArea,
              invasivenessLevel: created.invasivenessLevel,
              recoveryDays: created.recoveryDays,
              recommendedFrequencyDays: created.recommendedFrequencyDays,
              preparationNotes: created.preparationNotes,
              contraindications: created.contraindications,
              aftercareGuidance: created.aftercareGuidance,
            },
          },
          tx,
        );

        return created;
      });

      return this.mapConsultationType(consultationType);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new ConflictException(
          "Consultation type with this name already exists.",
        );
      }

      throw error;
    }
  }

  async updateConsultationType(
    actor: AuthenticatedUser,
    consultationTypeId: string,
    input: UpdateConsultationTypeDto,
  ): Promise<ConsultationTypeResponse> {
    this.accessService.ensureAdminAccess(actor);
    const tenantId = this.accessService.resolveActiveTenantId(actor);

    const existingConsultationType = await this.prisma.consultationType.findFirst({
      where: {
        id: consultationTypeId,
        tenantId,
      },
    });

    if (!existingConsultationType) {
      throw new NotFoundException("Consultation type not found.");
    }

    const updateData: Prisma.ConsultationTypeUpdateInput = {};

    if (typeof input.name === "string") {
      const name = input.name.trim();

      if (!name) {
        throw new BadRequestException("name cannot be empty.");
      }

      updateData.name = name;
    }

    if (input.durationMinutes !== undefined) {
      updateData.durationMinutes = this.parseDuration(input.durationMinutes);
    }

    if (input.bufferBeforeMinutes !== undefined) {
      updateData.bufferBeforeMinutes = this.parseBuffer(
        input.bufferBeforeMinutes,
        "bufferBeforeMinutes",
      );
    }

    if (input.bufferAfterMinutes !== undefined) {
      updateData.bufferAfterMinutes = this.parseBuffer(
        input.bufferAfterMinutes,
        "bufferAfterMinutes",
      );
    }

    if (typeof input.isFirstVisit === "boolean") {
      updateData.isFirstVisit = input.isFirstVisit;
    }

    if (typeof input.isReturnVisit === "boolean") {
      updateData.isReturnVisit = input.isReturnVisit;
    }

    if (typeof input.isOnline === "boolean") {
      updateData.isOnline = input.isOnline;
    }

    if (typeof input.isActive === "boolean") {
      updateData.isActive = input.isActive;
    }

    if (input.aestheticArea !== undefined) {
      updateData.aestheticArea = this.parseAestheticArea(input.aestheticArea);
    }

    if (input.invasivenessLevel !== undefined) {
      updateData.invasivenessLevel = this.parseInvasivenessLevel(
        input.invasivenessLevel,
      );
    }

    if (input.recoveryDays !== undefined) {
      updateData.recoveryDays = this.parseOptionalMetric(
        input.recoveryDays,
        "recoveryDays",
      );
    }

    if (input.recommendedFrequencyDays !== undefined) {
      updateData.recommendedFrequencyDays = this.parseOptionalMetric(
        input.recommendedFrequencyDays,
        "recommendedFrequencyDays",
      );
    }

    if (input.preparationNotes !== undefined) {
      updateData.preparationNotes = this.parseOptionalText(input.preparationNotes);
    }

    if (input.contraindications !== undefined) {
      updateData.contraindications = this.parseOptionalText(
        input.contraindications,
      );
    }

    if (input.aftercareGuidance !== undefined) {
      updateData.aftercareGuidance = this.parseOptionalText(
        input.aftercareGuidance,
      );
    }

    if (Object.keys(updateData).length === 0) {
      throw new BadRequestException("No valid fields were provided for update.");
    }

    try {
      const consultationType = await this.prisma.$transaction(async (tx) => {
        const updated = await tx.consultationType.update({
          where: { id: consultationTypeId },
          data: updateData,
        });

        await this.auditService.record(
          {
            action: AUDIT_ACTIONS.CONSULTATION_TYPE_UPDATED,
            actor,
            tenantId,
            targetType: "consultation_type",
            targetId: consultationTypeId,
            metadata: {
              updatedFields: Object.keys(updateData),
            },
          },
          tx,
        );

        return updated;
      });

      return this.mapConsultationType(consultationType);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new ConflictException(
          "Consultation type with this name already exists.",
        );
      }

      throw error;
    }
  }

  private parseDuration(value: unknown): number {
    const numeric = Number(value);

    if (!Number.isInteger(numeric) || numeric <= 0) {
      throw new BadRequestException("durationMinutes must be an integer > 0.");
    }

    return numeric;
  }

  private parseBuffer(
    value: unknown,
    field: string,
    fallback?: number,
  ): number {
    if (value === undefined) {
      if (fallback !== undefined) {
        return fallback;
      }

      throw new BadRequestException(`${field} is required.`);
    }

    const numeric = Number(value);

    if (!Number.isInteger(numeric) || numeric < 0) {
      throw new BadRequestException(`${field} must be an integer >= 0.`);
    }

    if (numeric > MAX_CONSULTATION_BUFFER_MINUTES) {
      throw new BadRequestException(
        `${field} must be <= ${MAX_CONSULTATION_BUFFER_MINUTES}.`,
      );
    }

    return numeric;
  }

  private parseOptionalMetric(
    value: unknown,
    field: string,
  ): number | null {
    if (value === undefined || value === null || value === "") {
      return null;
    }

    const numeric = Number(value);

    if (!Number.isInteger(numeric) || numeric < 0) {
      throw new BadRequestException(`${field} must be an integer >= 0.`);
    }

    return numeric;
  }

  private parseOptionalText(value: unknown): string | null {
    if (value === undefined || value === null) {
      return null;
    }

    const normalized = String(value).trim();
    return normalized ? normalized : null;
  }

  private parseAestheticArea(value: unknown): AestheticArea | null {
    if (value === undefined || value === null || value === "") {
      return null;
    }

    if ((Object.values(AestheticArea) as string[]).includes(String(value))) {
      return value as AestheticArea;
    }

    throw new BadRequestException("aestheticArea is invalid.");
  }

  private parseInvasivenessLevel(
    value: unknown,
  ): InvasivenessLevel | null {
    if (value === undefined || value === null || value === "") {
      return null;
    }

    if ((Object.values(InvasivenessLevel) as string[]).includes(String(value))) {
      return value as InvasivenessLevel;
    }

    throw new BadRequestException("invasivenessLevel is invalid.");
  }

  private mapConsultationType(
    consultationType: Prisma.ConsultationTypeGetPayload<Record<string, never>>,
  ): ConsultationTypeResponse {
    return {
      id: consultationType.id,
      tenantId: consultationType.tenantId,
      name: consultationType.name,
      durationMinutes: consultationType.durationMinutes,
      bufferBeforeMinutes: consultationType.bufferBeforeMinutes,
      bufferAfterMinutes: consultationType.bufferAfterMinutes,
      isFirstVisit: consultationType.isFirstVisit,
      isReturnVisit: consultationType.isReturnVisit,
      isOnline: consultationType.isOnline,
      isActive: consultationType.isActive,
      aestheticArea: consultationType.aestheticArea,
      invasivenessLevel: consultationType.invasivenessLevel,
      recoveryDays: consultationType.recoveryDays,
      recommendedFrequencyDays: consultationType.recommendedFrequencyDays,
      preparationNotes: consultationType.preparationNotes,
      contraindications: consultationType.contraindications,
      aftercareGuidance: consultationType.aftercareGuidance,
      createdAt: consultationType.createdAt,
      updatedAt: consultationType.updatedAt,
    };
  }
}
