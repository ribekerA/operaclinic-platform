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
import { CreateUnitDto } from "./dto/create-unit.dto";
import { UpdateUnitDto } from "./dto/update-unit.dto";
import { UnitResponse } from "./interfaces/unit.response";

@Injectable()
export class UnitsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accessService: ClinicStructureAccessService,
    private readonly auditService: AuditService,
  ) {}

  async listUnits(actor: AuthenticatedUser): Promise<UnitResponse[]> {
    const tenantId = this.accessService.resolveActiveTenantId(actor);

    const units = await this.prisma.unit.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
    });

    return units.map((unit) => this.mapUnit(unit));
  }

  async createUnit(
    actor: AuthenticatedUser,
    input: CreateUnitDto,
  ): Promise<UnitResponse> {
    this.accessService.ensureAdminAccess(actor);
    const tenantId = this.accessService.resolveActiveTenantId(actor);

    const name = input.name?.trim();

    if (!name) {
      throw new BadRequestException("name is required.");
    }

    try {
      const unit = await this.prisma.$transaction(async (tx) => {
        const created = await tx.unit.create({
          data: {
            tenantId,
            name,
            description: this.normalizeNullableString(input.description),
            isActive: input.isActive ?? true,
          },
        });

        await this.auditService.record(
          {
            action: AUDIT_ACTIONS.UNIT_CREATED,
            actor,
            tenantId,
            targetType: "unit",
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

      return this.mapUnit(unit);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new ConflictException("Unit with this name already exists.");
      }

      throw error;
    }
  }

  async updateUnit(
    actor: AuthenticatedUser,
    unitId: string,
    input: UpdateUnitDto,
  ): Promise<UnitResponse> {
    this.accessService.ensureAdminAccess(actor);
    const tenantId = this.accessService.resolveActiveTenantId(actor);

    const existingUnit = await this.prisma.unit.findFirst({
      where: {
        id: unitId,
        tenantId,
      },
    });

    if (!existingUnit) {
      throw new NotFoundException("Unit not found.");
    }

    const updateData: Prisma.UnitUpdateInput = {};

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
      const unit = await this.prisma.$transaction(async (tx) => {
        const updated = await tx.unit.update({
          where: { id: unitId },
          data: updateData,
        });

        await this.auditService.record(
          {
            action: AUDIT_ACTIONS.UNIT_UPDATED,
            actor,
            tenantId,
            targetType: "unit",
            targetId: updated.id,
            metadata: {
              updatedFields: Object.keys(updateData),
            },
          },
          tx,
        );

        return updated;
      });

      return this.mapUnit(unit);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new ConflictException("Unit with this name already exists.");
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

  private mapUnit(unit: Prisma.UnitGetPayload<Record<string, never>>): UnitResponse {
    return {
      id: unit.id,
      tenantId: unit.tenantId,
      name: unit.name,
      description: unit.description,
      isActive: unit.isActive,
      createdAt: unit.createdAt,
      updatedAt: unit.updatedAt,
    };
  }
}

