import { BadRequestException, Injectable } from "@nestjs/common";
import { Prisma, PrismaClient } from "@prisma/client";
import { PrismaService } from "../../database/prisma.service";

type DbClient = Prisma.TransactionClient | PrismaClient | PrismaService;

interface ActiveConsultationTypeReference {
  id: string;
  durationMinutes: number;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
}

@Injectable()
export class SchedulingReferencesService {
  constructor(private readonly prisma: PrismaService) {}

  async assertProfessionalBelongsToTenant(
    professionalId: string,
    tenantId: string,
    options: { requireActive?: boolean } = {},
    dbClient?: DbClient,
  ): Promise<void> {
    const db = dbClient ?? this.prisma;

    const professional = await db.professional.findFirst({
      where: {
        id: professionalId,
        tenantId,
        ...(options.requireActive ? { isActive: true } : {}),
      },
      select: {
        id: true,
      },
    });

    if (!professional) {
      throw new BadRequestException(
        options.requireActive
          ? "professionalId is invalid or inactive for active tenant."
          : "professionalId is invalid for active tenant.",
      );
    }
  }

  async assertUnitBelongsToTenant(
    unitId: string | null,
    tenantId: string,
    dbClient?: DbClient,
  ): Promise<void> {
    if (!unitId) {
      return;
    }

    const db = dbClient ?? this.prisma;

    const unit = await db.unit.findFirst({
      where: {
        id: unitId,
        tenantId,
      },
      select: {
        id: true,
      },
    });

    if (!unit) {
      throw new BadRequestException("unitId is invalid for active tenant.");
    }
  }

  async assertProfessionalAssignedToUnit(
    professionalId: string,
    unitId: string | null,
    tenantId: string,
    dbClient?: DbClient,
  ): Promise<void> {
    if (!unitId) {
      return;
    }

    const db = dbClient ?? this.prisma;

    const assignment = await db.professionalUnit.findFirst({
      where: {
        tenantId,
        professionalId,
        unitId,
      },
      select: {
        id: true,
      },
    });

    if (!assignment) {
      throw new BadRequestException(
        "professionalId is not assigned to unitId for active tenant.",
      );
    }
  }

  async assertPatientBelongsToTenant(
    patientId: string,
    tenantId: string,
    dbClient?: DbClient,
  ): Promise<void> {
    const db = dbClient ?? this.prisma;

    const patient = await db.patient.findFirst({
      where: {
        id: patientId,
        tenantId,
        mergedIntoPatientId: null,
      },
      select: {
        id: true,
      },
    });

    if (!patient) {
      throw new BadRequestException("patientId is invalid for active tenant.");
    }
  }

  async getActiveConsultationType(
    consultationTypeId: string,
    tenantId: string,
    dbClient?: DbClient,
  ): Promise<ActiveConsultationTypeReference> {
    const db = dbClient ?? this.prisma;

    const consultationType = await db.consultationType.findFirst({
      where: {
        id: consultationTypeId,
        tenantId,
        isActive: true,
      },
      select: {
        id: true,
        durationMinutes: true,
        bufferBeforeMinutes: true,
        bufferAfterMinutes: true,
      },
    });

    if (!consultationType) {
      throw new BadRequestException(
        "consultationTypeId is invalid or inactive for active tenant.",
      );
    }

    return consultationType;
  }
}
