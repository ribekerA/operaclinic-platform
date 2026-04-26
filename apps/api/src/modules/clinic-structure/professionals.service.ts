import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { hash } from "bcryptjs";
import type { ProfessionalLinkedUserSummary } from "@operaclinic/shared";
import { Prisma, RoleCode, UserStatus } from "@prisma/client";
import { AuthenticatedUser } from "../../auth/interfaces/authenticated-user.interface";
import { AUDIT_ACTIONS } from "../../common/audit/audit.constants";
import { AuditService } from "../../common/audit/audit.service";
import { PrismaService } from "../../database/prisma.service";
import { RolesService } from "../identity/roles.service";
import { ClinicStructureAccessService } from "./clinic-structure-access.service";
import { CreateProfessionalDto } from "./dto/create-professional.dto";
import { UpdateProfessionalDto } from "./dto/update-professional.dto";
import { ProfessionalResponse } from "./interfaces/professional.response";

const professionalInclude = {
  professionalSpecialties: {
    include: {
      specialty: true,
    },
  },
  professionalUnits: {
    include: {
      unit: true,
    },
  },
  user: {
    select: {
      id: true,
      email: true,
      fullName: true,
      status: true,
    },
  },
} satisfies Prisma.ProfessionalInclude;

type ProfessionalWithRelations = Prisma.ProfessionalGetPayload<{
  include: typeof professionalInclude;
}>;

@Injectable()
export class ProfessionalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accessService: ClinicStructureAccessService,
    private readonly rolesService: RolesService,
    private readonly auditService: AuditService,
  ) {}

  async listProfessionals(actor: AuthenticatedUser): Promise<ProfessionalResponse[]> {
    const tenantId = this.accessService.resolveActiveTenantId(actor);

    const professionals = await this.prisma.professional.findMany({
      where: { tenantId },
      include: professionalInclude,
      orderBy: { createdAt: "desc" },
    });

    return professionals.map((professional) => this.mapProfessional(professional));
  }

  async createProfessional(
    actor: AuthenticatedUser,
    input: CreateProfessionalDto,
  ): Promise<ProfessionalResponse> {
    this.accessService.ensureAdminAccess(actor);
    const tenantId = this.accessService.resolveActiveTenantId(actor);
    const roleIdMap = await this.rolesService.resolveRoleIdsByCodes([
      RoleCode.PROFESSIONAL,
    ]);

    const fullName = input.fullName?.trim();
    const displayName = input.displayName?.trim();
    const professionalRegister = input.professionalRegister?.trim();
    const accessEmail = input.accessEmail?.trim().toLowerCase();
    const accessPassword = input.accessPassword?.trim();
    const specialtyIds = this.normalizeIdList(input.specialtyIds, "specialtyIds");
    const unitIds = this.normalizeIdList(input.unitIds, "unitIds");

    if (
      !fullName ||
      !displayName ||
      !professionalRegister ||
      !accessEmail ||
      !accessPassword
    ) {
      throw new BadRequestException(
        "fullName, displayName, professionalRegister, accessEmail and accessPassword are required.",
      );
    }

    try {
      const professional = await this.prisma.$transaction(async (tx) => {
        await this.assertSpecialtiesBelongToTenant(specialtyIds, tenantId, tx);
        await this.assertUnitsBelongToTenant(unitIds, tenantId, tx);
        const passwordHash = await hash(accessPassword, 10);

        const user = await tx.user.create({
          data: {
            email: accessEmail,
            fullName,
            passwordHash,
            status: UserStatus.ACTIVE,
          },
        });

        await tx.userRole.create({
          data: {
            userId: user.id,
            roleId: roleIdMap.get(RoleCode.PROFESSIONAL) as string,
            tenantId,
          },
        });

        const created = await tx.professional.create({
          data: {
            tenantId,
            fullName,
            displayName,
            professionalRegister,
            userId: user.id,
            visibleForSelfBooking: input.visibleForSelfBooking ?? false,
            isActive: input.isActive ?? true,
          },
        });

        if (specialtyIds.length > 0) {
          await tx.professionalSpecialty.createMany({
            data: specialtyIds.map((specialtyId) => ({
              tenantId,
              professionalId: created.id,
              specialtyId,
            })),
            skipDuplicates: true,
          });
        }

        if (unitIds.length > 0) {
          await tx.professionalUnit.createMany({
            data: unitIds.map((unitId) => ({
              tenantId,
              professionalId: created.id,
              unitId,
            })),
            skipDuplicates: true,
          });
        }

        const createdWithRelations = await tx.professional.findUniqueOrThrow({
          where: { id: created.id },
          include: professionalInclude,
        });

        await this.auditService.record(
          {
            action: AUDIT_ACTIONS.USER_CREATED,
            actor,
            tenantId,
            targetType: "user",
            targetId: user.id,
            metadata: {
              email: user.email,
              status: user.status,
              roleCodes: [RoleCode.PROFESSIONAL],
              source: "professional_create",
              professionalId: created.id,
            },
          },
          tx,
        );

        await this.auditService.record(
          {
            action: AUDIT_ACTIONS.PROFESSIONAL_CREATED,
            actor,
            tenantId,
            targetType: "professional",
            targetId: created.id,
            metadata: {
              visibleForSelfBooking: created.visibleForSelfBooking,
              specialtyCount: specialtyIds.length,
              unitCount: unitIds.length,
              linkedUserId: user.id,
            },
          },
          tx,
        );

        await this.auditService.record(
          {
            action: AUDIT_ACTIONS.PROFESSIONAL_ACCESS_PROVISIONED,
            actor,
            tenantId,
            targetType: "professional",
            targetId: created.id,
            metadata: {
              userId: user.id,
              email: user.email,
              source: "professional_create",
              generatedPassword: false,
            },
          },
          tx,
        );

        return createdWithRelations;
      });

      return this.mapProfessional(professional);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new ConflictException(
          "Professional register or login already exists.",
        );
      }

      throw error;
    }
  }

  async updateProfessional(
    actor: AuthenticatedUser,
    professionalId: string,
    input: UpdateProfessionalDto,
  ): Promise<ProfessionalResponse> {
    this.accessService.ensureAdminAccess(actor);
    const tenantId = this.accessService.resolveActiveTenantId(actor);

    const existingProfessional = await this.prisma.professional.findFirst({
      where: {
        id: professionalId,
        tenantId,
      },
    });

    if (!existingProfessional) {
      throw new NotFoundException("Professional not found.");
    }

    const updateData: Prisma.ProfessionalUpdateInput = {};
    const specialtyIds =
      input.specialtyIds === undefined
        ? undefined
        : this.normalizeIdList(input.specialtyIds, "specialtyIds");
    const unitIds =
      input.unitIds === undefined
        ? undefined
        : this.normalizeIdList(input.unitIds, "unitIds");

    if (typeof input.fullName === "string") {
      const fullName = input.fullName.trim();

      if (!fullName) {
        throw new BadRequestException("fullName cannot be empty.");
      }

      updateData.fullName = fullName;
    }

    if (typeof input.displayName === "string") {
      const displayName = input.displayName.trim();

      if (!displayName) {
        throw new BadRequestException("displayName cannot be empty.");
      }

      updateData.displayName = displayName;
    }

    if (typeof input.professionalRegister === "string") {
      const professionalRegister = input.professionalRegister.trim();

      if (!professionalRegister) {
        throw new BadRequestException("professionalRegister cannot be empty.");
      }

      updateData.professionalRegister = professionalRegister;
    }

    if (typeof input.visibleForSelfBooking === "boolean") {
      updateData.visibleForSelfBooking = input.visibleForSelfBooking;
    }

    if (typeof input.isActive === "boolean") {
      updateData.isActive = input.isActive;
    }

    if (
      Object.keys(updateData).length === 0 &&
      specialtyIds === undefined &&
      unitIds === undefined
    ) {
      throw new BadRequestException("No valid fields were provided for update.");
    }

    try {
      const professional = await this.prisma.$transaction(async (tx) => {
        if (Object.keys(updateData).length > 0) {
          await tx.professional.update({
            where: { id: professionalId },
            data: updateData,
          });
        }

        if (specialtyIds !== undefined) {
          await this.assertSpecialtiesBelongToTenant(specialtyIds, tenantId, tx);

          await tx.professionalSpecialty.deleteMany({
            where: {
              tenantId,
              professionalId,
            },
          });

          if (specialtyIds.length > 0) {
            await tx.professionalSpecialty.createMany({
              data: specialtyIds.map((specialtyId) => ({
                tenantId,
                professionalId,
                specialtyId,
              })),
              skipDuplicates: true,
            });
          }
        }

        if (unitIds !== undefined) {
          await this.assertUnitsBelongToTenant(unitIds, tenantId, tx);

          await tx.professionalUnit.deleteMany({
            where: {
              tenantId,
              professionalId,
            },
          });

          if (unitIds.length > 0) {
            await tx.professionalUnit.createMany({
              data: unitIds.map((unitId) => ({
                tenantId,
                professionalId,
                unitId,
              })),
              skipDuplicates: true,
            });
          }
        }

        const updatedWithRelations = await tx.professional.findUniqueOrThrow({
          where: { id: professionalId },
          include: professionalInclude,
        });

        await this.auditService.record(
          {
            action: AUDIT_ACTIONS.PROFESSIONAL_UPDATED,
            actor,
            tenantId,
            targetType: "professional",
            targetId: professionalId,
            metadata: {
              updatedFields: Object.keys(updateData),
              specialtiesUpdated: specialtyIds !== undefined,
              unitsUpdated: unitIds !== undefined,
            },
          },
          tx,
        );

        return updatedWithRelations;
      });

      return this.mapProfessional(professional);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new ConflictException(
          "Professional register already exists in this tenant.",
        );
      }

      throw error;
    }
  }

  private normalizeIdList(ids: string[] | undefined, fieldName: string): string[] {
    if (ids === undefined) {
      return [];
    }

    if (!Array.isArray(ids)) {
      throw new BadRequestException(`${fieldName} must be an array of IDs.`);
    }

    const normalized = ids
      .map((id) => id.trim())
      .filter((id) => id.length > 0);

    return [...new Set(normalized)];
  }

  private async assertSpecialtiesBelongToTenant(
    specialtyIds: string[],
    tenantId: string,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    if (specialtyIds.length === 0) {
      return;
    }

    const count = await tx.specialty.count({
      where: {
        tenantId,
        id: {
          in: specialtyIds,
        },
      },
    });

    if (count !== specialtyIds.length) {
      throw new BadRequestException(
        "One or more specialties are invalid for the active tenant.",
      );
    }
  }

  private async assertUnitsBelongToTenant(
    unitIds: string[],
    tenantId: string,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    if (unitIds.length === 0) {
      return;
    }

    const count = await tx.unit.count({
      where: {
        tenantId,
        id: {
          in: unitIds,
        },
      },
    });

    if (count !== unitIds.length) {
      throw new BadRequestException(
        "One or more units are invalid for the active tenant.",
      );
    }
  }

  private mapLinkedUser(
    user: NonNullable<ProfessionalWithRelations["user"]>,
  ): ProfessionalLinkedUserSummary {
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      status: user.status,
    };
  }

  private mapProfessional(
    professional: ProfessionalWithRelations,
  ): ProfessionalResponse {
    return {
      id: professional.id,
      tenantId: professional.tenantId,
      fullName: professional.fullName,
      displayName: professional.displayName,
      professionalRegister: professional.professionalRegister,
      visibleForSelfBooking: professional.visibleForSelfBooking,
      isActive: professional.isActive,
      createdAt: professional.createdAt,
      updatedAt: professional.updatedAt,
      linkedUser: professional.user ? this.mapLinkedUser(professional.user) : null,
      specialties: professional.professionalSpecialties.map((assignment) => ({
        id: assignment.specialty.id,
        name: assignment.specialty.name,
        isActive: assignment.specialty.isActive,
      })),
      units: professional.professionalUnits.map((assignment) => ({
        id: assignment.unit.id,
        name: assignment.unit.name,
        isActive: assignment.unit.isActive,
      })),
    };
  }
}
