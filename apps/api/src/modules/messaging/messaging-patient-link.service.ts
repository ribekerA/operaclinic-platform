import { Injectable } from "@nestjs/common";
import { PatientContactType } from "@prisma/client";
import { PrismaService } from "../../database/prisma.service";

interface PatientLinkResolution {
  normalizedContactValue: string;
  patientId: string | null;
  patientDisplayName: string | null;
}

@Injectable()
export class MessagingPatientLinkService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveByContactValue(
    tenantId: string,
    rawContactValue: string,
  ): Promise<PatientLinkResolution> {
    const normalizedContactValue = this.normalizeContactValue(rawContactValue);
    const matches = await this.prisma.patientContact.findMany({
      where: {
        tenantId,
        normalizedValue: normalizedContactValue,
        type: {
          in: [PatientContactType.PHONE, PatientContactType.WHATSAPP],
        },
        patient: {
          mergedIntoPatientId: null,
        },
      },
      select: {
        patientId: true,
        patient: {
          select: {
            fullName: true,
          },
        },
      },
    });

    const distinctPatientIds = [...new Set(matches.map((match) => match.patientId))];

    if (distinctPatientIds.length !== 1) {
      return {
        normalizedContactValue,
        patientId: null,
        patientDisplayName: null,
      };
    }

    const firstMatch = matches.find(
      (match) => match.patientId === distinctPatientIds[0],
    );

    return {
      normalizedContactValue,
      patientId: distinctPatientIds[0] ?? null,
      patientDisplayName: firstMatch?.patient.fullName ?? null,
    };
  }

  normalizeContactValue(rawContactValue: string): string {
    const normalized = rawContactValue.replace(/\D/g, "");

    if (normalized.length < 8 || normalized.length > 20) {
      throw new Error("Invalid contact value for messaging.");
    }

    return normalized;
  }
}
