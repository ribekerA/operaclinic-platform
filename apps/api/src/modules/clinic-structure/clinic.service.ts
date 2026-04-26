import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { AuthenticatedUser } from "../../auth/interfaces/authenticated-user.interface";
import { AUDIT_ACTIONS } from "../../common/audit/audit.constants";
import { AuditService } from "../../common/audit/audit.service";
import { PrismaService } from "../../database/prisma.service";
import { UpdateClinicDto } from "./dto/update-clinic.dto";
import { ClinicProfileResponse } from "./interfaces/clinic-profile.response";
import { ClinicStructureAccessService } from "./clinic-structure-access.service";

@Injectable()
export class ClinicService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly accessService: ClinicStructureAccessService,
  ) {}

  async getClinic(actor: AuthenticatedUser): Promise<ClinicProfileResponse> {
    const tenantId = this.accessService.resolveActiveTenantId(actor);

    const clinic = await this.getOrCreateClinicByTenantId(tenantId);
    return this.mapClinic(clinic);
  }

  async updateClinic(
    actor: AuthenticatedUser,
    input: UpdateClinicDto,
  ): Promise<ClinicProfileResponse> {
    this.accessService.ensureAdminAccess(actor);
    const tenantId = this.accessService.resolveActiveTenantId(actor);
    const existingClinic = await this.getOrCreateClinicByTenantId(tenantId);

    const updateData: Prisma.ClinicUpdateInput = {};
    const tenantUpdateData: Prisma.TenantUpdateInput = {};

    if (typeof input.displayName === "string") {
      const displayName = input.displayName.trim();

      if (!displayName) {
        throw new BadRequestException("displayName cannot be empty.");
      }

      updateData.displayName = displayName;
    }

    if (typeof input.legalName === "string") {
      updateData.legalName = this.normalizeNullableString(input.legalName);
    }

    if (typeof input.documentNumber === "string") {
      updateData.documentNumber = this.normalizeNullableString(input.documentNumber);
    }

    if (typeof input.contactEmail === "string") {
      const normalizedEmail = input.contactEmail.trim().toLowerCase();
      updateData.contactEmail = normalizedEmail ? normalizedEmail : null;
    }

    if (typeof input.contactPhone === "string") {
      updateData.contactPhone = this.normalizeNullableString(input.contactPhone);
    }

    if (typeof input.timezone === "string") {
      const timezone = input.timezone.trim();

      if (!timezone) {
        throw new BadRequestException("timezone cannot be empty.");
      }

      updateData.timezone = timezone;
      tenantUpdateData.timezone = timezone;
    }

    if (typeof input.isActive === "boolean") {
      updateData.isActive = input.isActive;
    }

    if (
      Object.keys(updateData).length === 0 &&
      Object.keys(tenantUpdateData).length === 0
    ) {
      throw new BadRequestException(
        "No valid fields were provided for clinic update.",
      );
    }

    try {
      const updatedClinic = await this.prisma.$transaction(async (tx) => {
        if (Object.keys(tenantUpdateData).length > 0) {
          await tx.tenant.update({
            where: { id: tenantId },
            data: tenantUpdateData,
          });
        }

        const clinic = await tx.clinic.update({
          where: { tenantId },
          data: updateData,
        });

        await this.auditService.record(
          {
            action: AUDIT_ACTIONS.CLINIC_PROFILE_UPDATED,
            actor,
            tenantId,
            targetType: "clinic",
            targetId: clinic.id,
            metadata: {
              updatedFields: Object.keys(updateData),
            },
          },
          tx,
        );

        return clinic;
      });

      return this.mapClinic(updatedClinic);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new BadRequestException("Clinic data violates a unique constraint.");
      }

      throw error;
    }
  }

  private async getOrCreateClinicByTenantId(tenantId: string) {
    const existingClinic = await this.prisma.clinic.findUnique({
      where: { tenantId },
    });

    if (existingClinic) {
      return existingClinic;
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        name: true,
        timezone: true,
      },
    });

    if (!tenant) {
      throw new NotFoundException("Tenant not found for clinic context.");
    }

    return this.prisma.clinic.create({
      data: {
        tenantId: tenant.id,
        displayName: tenant.name,
        timezone: tenant.timezone,
        isActive: true,
      },
    });
  }

  private normalizeNullableString(rawValue: string): string | null {
    const normalized = rawValue.trim();
    return normalized ? normalized : null;
  }

  private mapClinic(
    clinic: Prisma.ClinicGetPayload<Record<string, never>>,
  ): ClinicProfileResponse {
    return {
      id: clinic.id,
      tenantId: clinic.tenantId,
      displayName: clinic.displayName,
      legalName: clinic.legalName,
      documentNumber: clinic.documentNumber,
      contactEmail: clinic.contactEmail,
      contactPhone: clinic.contactPhone,
      timezone: clinic.timezone,
      isActive: clinic.isActive,
      createdAt: clinic.createdAt,
      updatedAt: clinic.updatedAt,
    };
  }
}
