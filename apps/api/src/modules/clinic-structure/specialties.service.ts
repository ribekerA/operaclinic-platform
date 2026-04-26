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
import { CreateSpecialtyDto } from "./dto/create-specialty.dto";
import { UpdateSpecialtyDto } from "./dto/update-specialty.dto";
import { SpecialtyResponse } from "./interfaces/specialty.response";

@Injectable()
export class SpecialtiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accessService: ClinicStructureAccessService,
    private readonly auditService: AuditService,
  ) {}

  async listSpecialties(actor: AuthenticatedUser): Promise<SpecialtyResponse[]> {
    const tenantId = this.accessService.resolveActiveTenantId(actor);

    const specialties = await this.prisma.specialty.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
    });

    return specialties.map((specialty) => this.mapSpecialty(specialty));
  }

  async createSpecialty(
    actor: AuthenticatedUser,
    input: CreateSpecialtyDto,
  ): Promise<SpecialtyResponse> {
    this.accessService.ensureAdminAccess(actor);
    const tenantId = this.accessService.resolveActiveTenantId(actor);

    const name = input.name?.trim();

    if (!name) {
      throw new BadRequestException("name is required.");
    }

    try {
      const specialty = await this.prisma.$transaction(async (tx) => {
        const created = await tx.specialty.create({
          data: {
            tenantId,
            name,
            description: this.normalizeNullableString(input.description),
            isActive: input.isActive ?? true,
          },
        });

        await this.auditService.record(
          {
            action: AUDIT_ACTIONS.SPECIALTY_CREATED,
            actor,
            tenantId,
            targetType: "specialty",
            targetId: created.id,
            metadata: {
              name: created.name,
              isActive: created.isActive,
            },
          },
          tx,
        );

        return created;
      });

      return this.mapSpecialty(specialty);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new ConflictException("Specialty with this name already exists.");
      }

      throw error;
    }
  }

  async updateSpecialty(
    actor: AuthenticatedUser,
    specialtyId: string,
    input: UpdateSpecialtyDto,
  ): Promise<SpecialtyResponse> {
    this.accessService.ensureAdminAccess(actor);
    const tenantId = this.accessService.resolveActiveTenantId(actor);

    const existingSpecialty = await this.prisma.specialty.findFirst({
      where: {
        id: specialtyId,
        tenantId,
      },
    });

    if (!existingSpecialty) {
      throw new NotFoundException("Specialty not found.");
    }

    const updateData: Prisma.SpecialtyUpdateInput = {};

    if (typeof input.name === "string") {
      const name = input.name.trim();

      if (!name) {
        throw new BadRequestException("name cannot be empty.");
      }

      updateData.name = name;
    }

    if (typeof input.description === "string") {
      updateData.description = this.normalizeNullableString(input.description);
    }

    if (typeof input.isActive === "boolean") {
      updateData.isActive = input.isActive;
    }

    if (Object.keys(updateData).length === 0) {
      throw new BadRequestException("No valid fields were provided for update.");
    }

    try {
      const specialty = await this.prisma.$transaction(async (tx) => {
        const updated = await tx.specialty.update({
          where: { id: specialtyId },
          data: updateData,
        });

        await this.auditService.record(
          {
            action: AUDIT_ACTIONS.SPECIALTY_UPDATED,
            actor,
            tenantId,
            targetType: "specialty",
            targetId: updated.id,
            metadata: {
              updatedFields: Object.keys(updateData),
            },
          },
          tx,
        );

        return updated;
      });

      return this.mapSpecialty(specialty);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new ConflictException("Specialty with this name already exists.");
      }

      throw error;
    }
  }

  private normalizeNullableString(rawValue: string | undefined): string | null {
    if (typeof rawValue !== "string") {
      return null;
    }

    const normalized = rawValue.trim();
    return normalized ? normalized : null;
  }

  private mapSpecialty(
    specialty: Prisma.SpecialtyGetPayload<Record<string, never>>,
  ): SpecialtyResponse {
    return {
      id: specialty.id,
      tenantId: specialty.tenantId,
      name: specialty.name,
      description: specialty.description,
      isActive: specialty.isActive,
      createdAt: specialty.createdAt,
      updatedAt: specialty.updatedAt,
    };
  }
}

