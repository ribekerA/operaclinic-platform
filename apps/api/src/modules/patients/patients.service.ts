import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  Prisma,
  PrismaClient,
  PatientContactType,
  ProtocolSessionStatus,
} from "@prisma/client";
import { AuthenticatedUser } from "../../auth/interfaces/authenticated-user.interface";
import { AUDIT_ACTIONS } from "../../common/audit/audit.constants";
import { AuditService } from "../../common/audit/audit.service";
import { PrismaService } from "../../database/prisma.service";
import { CreatePatientDto } from "./dto/create-patient.dto";
import { FindOrMergePatientDto } from "./dto/find-or-merge-patient.dto";
import { ListPatientsQueryDto } from "./dto/list-patients-query.dto";
import { PatientContactInputDto } from "./dto/patient-contact-input.dto";
import { UpdatePatientContactAutomatedMessagingDto } from "./dto/update-patient-contact-automated-messaging.dto";
import { UpdatePatientDto } from "./dto/update-patient.dto";
import { PatientContactAutomatedMessagingPreferenceResponse } from "./interfaces/patient-contact-automated-messaging.response";
import { PatientSummaryResponse } from "./interfaces/patient-summary.response";
import { PatientsAccessService } from "./patients-access.service";

type DbClient = Prisma.TransactionClient | PrismaClient | PrismaService;

type PatientWithContacts = Prisma.PatientGetPayload<{
  include: {
    contacts: true;
    patientProtocolInstances: {
      include: {
        procedureProtocol: {
          include: {
            consultationType: true;
          };
        };
        sessionAppointments: {
          orderBy: {
            sessionSequence: "asc";
          };
        };
      };
    };
  };
}>;

interface NormalizedContact {
  type: PatientContactType;
  value: string;
  normalizedValue: string;
  isPrimary: boolean;
}

interface NormalizedPatientBaseInput {
  fullName: string | null;
  birthDate: Date | null;
  documentNumber: string | null;
  notes: string | null;
  isActive: boolean;
  contacts: NormalizedContact[];
}

@Injectable()
export class PatientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accessService: PatientsAccessService,
    private readonly auditService: AuditService,
  ) {}

  async listPatients(
    actor: AuthenticatedUser,
    query: ListPatientsQueryDto,
  ): Promise<PatientSummaryResponse[]> {
    const tenantId = this.accessService.resolveActiveTenantId(actor);

    const where: Prisma.PatientWhereInput = {
      tenantId,
      mergedIntoPatientId: null,
    };

    if (typeof query.isActive === "string") {
      where.isActive = this.parseBoolean(query.isActive, "isActive");
    }

    const filters: Prisma.PatientWhereInput[] = [];

    if (query.search?.trim()) {
      const search = query.search.trim();
      const searchFilters: Prisma.PatientWhereInput[] = [
        { fullName: { contains: search, mode: "insensitive" } },
        { documentNumber: { contains: search, mode: "insensitive" } },
      ];

      const normalizedSearch = this.onlyDigits(search);
      if (normalizedSearch) {
        searchFilters.push({
          contacts: {
            some: {
              normalizedValue: {
                contains: normalizedSearch,
              },
            },
          },
        });
      }

      filters.push({
        OR: searchFilters,
      });
    }

    if (query.contactValue?.trim()) {
      const normalizedContact = this.normalizeContactValue(query.contactValue);
      filters.push({
        contacts: {
          some: {
            normalizedValue: {
              contains: normalizedContact,
            },
          },
        },
      });
    }

    if (filters.length === 1) {
      Object.assign(where, filters[0]);
    }

    if (filters.length > 1) {
      where.AND = filters;
    }

    const limit = this.parseLimit(query.limit);

    const patients = await this.prisma.patient.findMany({
      where,
      include: {
        contacts: {
          orderBy: [
            { isPrimary: "desc" },
            { createdAt: "asc" },
          ],
        },
        patientProtocolInstances: {
          include: {
            procedureProtocol: {
              include: {
                consultationType: true,
              },
            },
            sessionAppointments: {
              orderBy: {
                sessionSequence: "asc",
              },
            },
          },
          orderBy: [
            { status: "asc" },
            { updatedAt: "desc" },
          ],
        },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    return patients.map((patient) => this.mapPatient(patient));
  }

  async createPatient(
    actor: AuthenticatedUser,
    input: CreatePatientDto,
  ): Promise<PatientSummaryResponse> {
    const tenantId = this.accessService.resolveActiveTenantId(actor);
    const normalizedInput = this.normalizeBaseInput(input);

    try {
      const patient = await this.prisma.$transaction(async (tx) => {
        await this.assertNoContactOwnershipConflict(
          tenantId,
          normalizedInput.contacts,
          null,
          tx,
        );

        const created = await tx.patient.create({
          data: {
            tenantId,
            fullName: normalizedInput.fullName,
            birthDate: normalizedInput.birthDate,
            documentNumber: normalizedInput.documentNumber,
            notes: normalizedInput.notes,
            isActive: normalizedInput.isActive,
          },
        });

        await this.replaceContacts(created.id, tenantId, normalizedInput.contacts, tx);

        const withContacts = await tx.patient.findUniqueOrThrow({
          where: { id: created.id },
          include: {
            contacts: {
              orderBy: [
                { isPrimary: "desc" },
                { createdAt: "asc" },
              ],
            },
            patientProtocolInstances: {
              include: {
                procedureProtocol: {
                  include: {
                    consultationType: true,
                  },
                },
                sessionAppointments: {
                  orderBy: {
                    sessionSequence: "asc",
                  },
                },
              },
              orderBy: [
                { status: "asc" },
                { updatedAt: "desc" },
              ],
            },
          },
        });

        await this.auditService.record(
          {
            action: AUDIT_ACTIONS.PATIENT_CREATED,
            actor,
            tenantId,
            targetType: "patient",
            targetId: created.id,
            metadata: {
              contactCount: normalizedInput.contacts.length,
            },
          },
          tx,
        );

        return withContacts;
      });

      return this.mapPatient(patient);
    } catch (error) {
      this.handleUniqueConstraintError(error);
      throw error;
    }
  }

  async updatePatient(
    actor: AuthenticatedUser,
    patientId: string,
    input: UpdatePatientDto,
  ): Promise<PatientSummaryResponse> {
    const tenantId = this.accessService.resolveActiveTenantId(actor);

    const existing = await this.prisma.patient.findFirst({
      where: {
        id: patientId,
        tenantId,
      },
      include: {
        contacts: true,
      },
    });

    if (!existing) {
      throw new NotFoundException("Patient not found.");
    }

    if (existing.mergedIntoPatientId) {
      throw new BadRequestException(
        "Cannot update a patient that has already been merged.",
      );
    }

    const updateData: Prisma.PatientUpdateInput = {};

    if (typeof input.fullName === "string") {
      const fullName = input.fullName.trim();

      if (!fullName) {
        throw new BadRequestException("fullName cannot be empty.");
      }

      updateData.fullName = fullName;
    }

    if (typeof input.birthDate === "string") {
      updateData.birthDate = this.parseDateOnly(input.birthDate, "birthDate");
    }

    if (typeof input.documentNumber === "string") {
      const documentNumber = input.documentNumber.trim();
      updateData.documentNumber = documentNumber || null;
    }

    if (typeof input.notes === "string") {
      const notes = input.notes.trim();
      updateData.notes = notes || null;
    }

    if (typeof input.isActive === "boolean") {
      updateData.isActive = input.isActive;
    }

    const normalizedContacts =
      input.contacts === undefined
        ? undefined
        : this.normalizeContacts(input.contacts, {
            fieldName: "contacts",
            required: false,
          });

    if (
      Object.keys(updateData).length === 0 &&
      normalizedContacts === undefined
    ) {
      throw new BadRequestException("No valid fields were provided for update.");
    }

    try {
      const updated = await this.prisma.$transaction(async (tx) => {
        if (normalizedContacts !== undefined) {
          await this.assertNoContactOwnershipConflict(
            tenantId,
            normalizedContacts,
            patientId,
            tx,
          );
        }

        if (Object.keys(updateData).length > 0) {
          await tx.patient.update({
            where: { id: patientId },
            data: updateData,
          });
        }

        if (normalizedContacts !== undefined) {
          await this.replaceContacts(patientId, tenantId, normalizedContacts, tx);
        }

        const patient = await tx.patient.findUniqueOrThrow({
          where: { id: patientId },
          include: {
            contacts: {
              orderBy: [
                { isPrimary: "desc" },
                { createdAt: "asc" },
              ],
            },
            patientProtocolInstances: {
              include: {
                procedureProtocol: {
                  include: {
                    consultationType: true,
                  },
                },
                sessionAppointments: {
                  orderBy: {
                    sessionSequence: "asc",
                  },
                },
              },
              orderBy: [
                { status: "asc" },
                { updatedAt: "desc" },
              ],
            },
          },
        });

        await this.auditService.record(
          {
            action: AUDIT_ACTIONS.PATIENT_UPDATED,
            actor,
            tenantId,
            targetType: "patient",
            targetId: patientId,
            metadata: {
              updatedFields: Object.keys(updateData),
              contactsUpdated: normalizedContacts !== undefined,
            },
          },
          tx,
        );

        return patient;
      });

      return this.mapPatient(updated);
    } catch (error) {
      this.handleUniqueConstraintError(error);
      throw error;
    }
  }

  async updateContactAutomatedMessagingPreference(
    actor: AuthenticatedUser,
    patientId: string,
    contactId: string,
    input: UpdatePatientContactAutomatedMessagingDto,
  ): Promise<PatientContactAutomatedMessagingPreferenceResponse> {
    const tenantId = this.accessService.resolveActiveTenantId(actor);
    const existing = await this.prisma.patientContact.findFirst({
      where: {
        id: contactId,
        patientId,
        tenantId,
      },
      select: {
        id: true,
        patientId: true,
        allowAutomatedMessaging: true,
      },
    });

    if (!existing) {
      throw new NotFoundException("Patient contact not found.");
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const record = await tx.patientContact.update({
        where: {
          id: existing.id,
        },
        data: {
          allowAutomatedMessaging: input.enabled,
          automatedMessagingOptedOutAt: input.enabled ? null : now,
        },
        select: {
          id: true,
          patientId: true,
          allowAutomatedMessaging: true,
          automatedMessagingOptedOutAt: true,
          updatedAt: true,
        },
      });

      await this.auditService.record(
        {
          action: AUDIT_ACTIONS.PATIENT_CONTACT_AUTOMATED_MESSAGING_UPDATED,
          actor,
          tenantId,
          targetType: "patient_contact",
          targetId: existing.id,
          metadata: {
            patientId,
            enabled: input.enabled,
            reason: input.reason?.trim() || null,
            previousEnabled: existing.allowAutomatedMessaging,
          },
        },
        tx,
      );

      return record;
    });

    return {
      patientId: updated.patientId,
      contactId: updated.id,
      allowAutomatedMessaging: updated.allowAutomatedMessaging,
      automatedMessagingOptedOutAt:
        updated.automatedMessagingOptedOutAt?.toISOString() ?? null,
      updatedAt: updated.updatedAt.toISOString(),
    };
  }

  async findOrMergePatient(
    actor: AuthenticatedUser,
    input: FindOrMergePatientDto,
  ): Promise<PatientSummaryResponse> {
    const tenantId = this.accessService.resolveActiveTenantId(actor);

    const contacts = this.normalizeContacts(input.contacts, {
      fieldName: "contacts",
      required: true,
    });

    const matchingContacts = await this.prisma.patientContact.findMany({
      where: {
        tenantId,
        OR: contacts.map((contact) => ({
          type: contact.type,
          normalizedValue: contact.normalizedValue,
        })),
      },
      select: {
        patientId: true,
      },
    });

    const matchedPatientIds = [...new Set(matchingContacts.map((item) => item.patientId))];

    if (matchedPatientIds.length === 0) {
      return this.createPatient(actor, {
        fullName: input.fullName,
        birthDate: input.birthDate,
        documentNumber: input.documentNumber,
        notes: input.notes,
        isActive: input.isActive,
        contacts: input.contacts,
      });
    }

    const normalizedInput = this.normalizeBaseInput({
      fullName: input.fullName,
      birthDate: input.birthDate,
      documentNumber: input.documentNumber,
      notes: input.notes,
      isActive: input.isActive,
      contacts: input.contacts,
    });

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const matchedPatients = await tx.patient.findMany({
          where: {
            tenantId,
            id: {
              in: matchedPatientIds,
            },
          },
          include: {
            contacts: true,
            patientProtocolInstances: true,
          },
          orderBy: {
            createdAt: "asc",
          },
        });

        if (matchedPatients.length === 0) {
          throw new NotFoundException("No matching patient found for merge.");
        }

        const canonical = matchedPatients[0];
        const duplicateIds = matchedPatients
          .filter((patient) => patient.id !== canonical.id)
          .map((patient) => patient.id);

        for (const duplicateId of duplicateIds) {
          await tx.appointment.updateMany({
            where: {
              tenantId,
              patientId: duplicateId,
            },
            data: {
              patientId: canonical.id,
            },
          });

          await tx.slotHold.updateMany({
            where: {
              tenantId,
              patientId: duplicateId,
            },
            data: {
              patientId: canonical.id,
            },
          });

          await tx.waitlist.updateMany({
            where: {
              tenantId,
              patientId: duplicateId,
            },
            data: {
              patientId: canonical.id,
            },
          });

          await tx.patientContact.updateMany({
            where: {
              tenantId,
              patientId: duplicateId,
            },
            data: {
              patientId: canonical.id,
            },
          });

          await tx.patient.update({
            where: { id: duplicateId },
            data: {
              mergedIntoPatientId: canonical.id,
              mergedAt: new Date(),
              isActive: false,
            },
          });
        }

        const currentCanonical = await tx.patient.findUniqueOrThrow({
          where: { id: canonical.id },
          include: {
            contacts: true,
            patientProtocolInstances: true,
          },
        });

        const enrichmentData: Prisma.PatientUpdateInput = {};

        if (!currentCanonical.fullName && normalizedInput.fullName) {
          enrichmentData.fullName = normalizedInput.fullName;
        }

        if (!currentCanonical.birthDate && normalizedInput.birthDate) {
          enrichmentData.birthDate = normalizedInput.birthDate;
        }

        if (!currentCanonical.documentNumber && normalizedInput.documentNumber) {
          enrichmentData.documentNumber = normalizedInput.documentNumber;
        }

        if (!currentCanonical.notes && normalizedInput.notes) {
          enrichmentData.notes = normalizedInput.notes;
        }

        if (!currentCanonical.isActive && normalizedInput.isActive) {
          enrichmentData.isActive = true;
        }

        if (Object.keys(enrichmentData).length > 0) {
          await tx.patient.update({
            where: { id: canonical.id },
            data: enrichmentData,
          });
        }

        await this.attachMissingContacts(canonical.id, tenantId, contacts, tx);

        const finalPatient = await tx.patient.findUniqueOrThrow({
          where: { id: canonical.id },
          include: {
            contacts: {
              orderBy: [
                { isPrimary: "desc" },
                { createdAt: "asc" },
              ],
            },
            patientProtocolInstances: {
              include: {
                procedureProtocol: {
                  include: {
                    consultationType: true,
                  },
                },
                sessionAppointments: {
                  orderBy: {
                    sessionSequence: "asc",
                  },
                },
              },
              orderBy: [
                { status: "asc" },
                { updatedAt: "desc" },
              ],
            },
          },
        });

        if (duplicateIds.length > 0) {
          await this.auditService.record(
            {
              action: AUDIT_ACTIONS.PATIENT_MERGED,
              actor,
              tenantId,
              targetType: "patient",
              targetId: finalPatient.id,
              metadata: {
                mergedPatientIds: duplicateIds,
                matchedContacts: contacts.map((contact) => ({
                  type: contact.type,
                  normalizedValue: contact.normalizedValue,
                })),
              },
            },
            tx,
          );
        } else {
          await this.auditService.record(
            {
              action: AUDIT_ACTIONS.PATIENT_UPDATED,
              actor,
              tenantId,
              targetType: "patient",
              targetId: finalPatient.id,
              metadata: {
                source: "find-or-merge",
                contactCount: contacts.length,
              },
            },
            tx,
          );
        }

        return finalPatient;
      });

      return this.mapPatient(result);
    } catch (error) {
      this.handleUniqueConstraintError(error);
      throw error;
    }
  }

  private normalizeBaseInput(
    input: {
      fullName?: string;
      birthDate?: string;
      documentNumber?: string;
      notes?: string;
      isActive?: boolean;
      contacts?: PatientContactInputDto[];
    },
  ): NormalizedPatientBaseInput {
    let fullName: string | null = null;

    if (typeof input.fullName === "string") {
      const normalized = input.fullName.trim();

      if (!normalized) {
        throw new BadRequestException("fullName cannot be empty.");
      }

      fullName = normalized;
    }

    let birthDate: Date | null = null;

    if (typeof input.birthDate === "string") {
      birthDate = this.parseDateOnly(input.birthDate, "birthDate");
    }

    let documentNumber: string | null = null;

    if (typeof input.documentNumber === "string") {
      const normalized = input.documentNumber.trim();
      documentNumber = normalized || null;
    }

    let notes: string | null = null;

    if (typeof input.notes === "string") {
      const normalized = input.notes.trim();
      notes = normalized || null;
    }

    const contacts = this.normalizeContacts(input.contacts ?? [], {
      fieldName: "contacts",
      required: false,
    });

    return {
      fullName,
      birthDate,
      documentNumber,
      notes,
      isActive: input.isActive ?? true,
      contacts,
    };
  }

  private normalizeContacts(
    contacts: PatientContactInputDto[] | undefined,
    options: { fieldName: string; required: boolean },
  ): NormalizedContact[] {
    if (!contacts) {
      if (options.required) {
        throw new BadRequestException(`${options.fieldName} is required.`);
      }

      return [];
    }

    if (!Array.isArray(contacts)) {
      throw new BadRequestException(
        `${options.fieldName} must be an array of contacts.`,
      );
    }

    const dedupedMap = new Map<string, NormalizedContact>();
    let preferredPrimaryKey: string | null = null;

    for (const [index, contact] of contacts.entries()) {
      if (!contact || typeof contact !== "object") {
        throw new BadRequestException(
          `${options.fieldName}[${index}] is not a valid contact payload.`,
        );
      }

      const type = this.parseContactType(contact.type);
      const value = (contact.value ?? "").trim();

      if (!value) {
        throw new BadRequestException(
          `${options.fieldName}[${index}].value is required.`,
        );
      }

      const normalizedValue = this.normalizeContactValue(value);
      const dedupeKey = `${type}:${normalizedValue}`;

      if (!dedupedMap.has(dedupeKey)) {
        dedupedMap.set(dedupeKey, {
          type,
          value,
          normalizedValue,
          isPrimary: false,
        });
      }

      if (contact.isPrimary === true && preferredPrimaryKey === null) {
        preferredPrimaryKey = dedupeKey;
      }
    }

    const normalized = [...dedupedMap.values()];

    if (options.required && normalized.length === 0) {
      throw new BadRequestException(
        `${options.fieldName} must contain at least one contact.`,
      );
    }

    if (normalized.length === 0) {
      return [];
    }

    const primaryKey =
      preferredPrimaryKey ??
      `${normalized[0].type}:${normalized[0].normalizedValue}`;

    return normalized.map((contact) => ({
      ...contact,
      isPrimary: `${contact.type}:${contact.normalizedValue}` === primaryKey,
    }));
  }

  private async assertNoContactOwnershipConflict(
    tenantId: string,
    contacts: NormalizedContact[],
    excludePatientId: string | null,
    dbClient?: DbClient,
  ): Promise<void> {
    if (contacts.length === 0) {
      return;
    }

    const db = dbClient ?? this.prisma;

    const conflicting = await db.patientContact.findMany({
      where: {
        tenantId,
        OR: contacts.map((contact) => ({
          type: contact.type,
          normalizedValue: contact.normalizedValue,
        })),
        ...(excludePatientId
          ? {
              patientId: {
                not: excludePatientId,
              },
            }
          : {}),
      },
      select: {
        patientId: true,
      },
      take: 1,
    });

    if (conflicting.length > 0) {
      throw new ConflictException(
        "One or more contacts are already linked to another patient. Use find-or-merge.",
      );
    }
  }

  private async replaceContacts(
    patientId: string,
    tenantId: string,
    contacts: NormalizedContact[],
    dbClient: DbClient,
  ): Promise<void> {
    const existingContacts = await dbClient.patientContact.findMany({
      where: {
        tenantId,
        patientId,
      },
      select: {
        type: true,
        normalizedValue: true,
      },
    });

    const incomingKeys = new Set(
      contacts.map((contact) => `${contact.type}:${contact.normalizedValue}`),
    );

    if (contacts.length === 0) {
      await dbClient.patientContact.deleteMany({
        where: {
          tenantId,
          patientId,
        },
      });
      return;
    }

    await dbClient.patientContact.deleteMany({
      where: {
        tenantId,
        patientId,
        NOT: {
          OR: contacts.map((contact) => ({
            type: contact.type,
            normalizedValue: contact.normalizedValue,
          })),
        },
      },
    });

    for (const contact of contacts) {
      if (!incomingKeys.has(`${contact.type}:${contact.normalizedValue}`)) {
        continue;
      }

      await dbClient.patientContact.updateMany({
        where: {
          tenantId,
          patientId,
          type: contact.type,
          normalizedValue: contact.normalizedValue,
        },
        data: {
          value: contact.value,
          isPrimary: contact.isPrimary,
        },
      });
    }

    const existingKeys = new Set(
      existingContacts.map((contact) => `${contact.type}:${contact.normalizedValue}`),
    );

    const missingContacts = contacts
      .filter(
        (contact) => !existingKeys.has(`${contact.type}:${contact.normalizedValue}`),
      )
      .map((contact) => ({
        tenantId,
        patientId,
        type: contact.type,
        value: contact.value,
        normalizedValue: contact.normalizedValue,
        isPrimary: contact.isPrimary,
      }));

    if (missingContacts.length > 0) {
      await dbClient.patientContact.createMany({
        data: missingContacts,
        skipDuplicates: false,
      });
    }
  }

  private async attachMissingContacts(
    patientId: string,
    tenantId: string,
    contacts: NormalizedContact[],
    dbClient: DbClient,
  ): Promise<void> {
    if (contacts.length === 0) {
      return;
    }

    const existingContacts = await dbClient.patientContact.findMany({
      where: {
        tenantId,
        patientId,
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    const existingKeys = new Set(
      existingContacts.map((contact) => `${contact.type}:${contact.normalizedValue}`),
    );

    const missingContacts = contacts.filter(
      (contact) => !existingKeys.has(`${contact.type}:${contact.normalizedValue}`),
    );

    if (missingContacts.length > 0) {
      await dbClient.patientContact.createMany({
        data: missingContacts.map((contact) => ({
          tenantId,
          patientId,
          type: contact.type,
          value: contact.value,
          normalizedValue: contact.normalizedValue,
          isPrimary: false,
        })),
      });
    }

    const allContacts = await dbClient.patientContact.findMany({
      where: {
        tenantId,
        patientId,
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    if (allContacts.length === 0) {
      return;
    }

    const preferredPrimary = contacts.find((contact) => contact.isPrimary);
    const preferredPrimaryRecord = preferredPrimary
      ? allContacts.find(
          (contact) =>
            contact.type === preferredPrimary.type &&
            contact.normalizedValue === preferredPrimary.normalizedValue,
        )
      : null;

    const fallbackPrimaryRecord =
      preferredPrimaryRecord ??
      allContacts.find((contact) => contact.isPrimary) ??
      allContacts[0];

    await dbClient.patientContact.updateMany({
      where: {
        tenantId,
        patientId,
      },
      data: {
        isPrimary: false,
      },
    });

    await dbClient.patientContact.update({
      where: {
        id: fallbackPrimaryRecord.id,
      },
      data: {
        isPrimary: true,
      },
    });
  }

  private parseBoolean(value: string, field: string): boolean {
    const normalized = value.trim().toLowerCase();

    if (normalized === "true") {
      return true;
    }

    if (normalized === "false") {
      return false;
    }

    throw new BadRequestException(`${field} must be 'true' or 'false'.`);
  }

  private parseLimit(rawLimit: string | undefined): number {
    if (!rawLimit) {
      return 50;
    }

    const parsed = Number.parseInt(rawLimit, 10);

    if (Number.isNaN(parsed) || parsed <= 0) {
      throw new BadRequestException("limit must be a positive integer.");
    }

    return Math.min(parsed, 200);
  }

  private parseDateOnly(value: string, fieldName: string): Date {
    const normalized = value.trim();

    if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
      throw new BadRequestException(
        `${fieldName} must be provided in YYYY-MM-DD format.`,
      );
    }

    const parsed = new Date(`${normalized}T00:00:00.000Z`);

    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(`${fieldName} is invalid.`);
    }

    return parsed;
  }

  private parseContactType(value: unknown): PatientContactType {
    if (
      typeof value === "string" &&
      (Object.values(PatientContactType) as string[]).includes(value)
    ) {
      return value as PatientContactType;
    }

    throw new BadRequestException("Invalid contact type. Use PHONE or WHATSAPP.");
  }

  private normalizeContactValue(rawValue: string): string {
    const digits = this.onlyDigits(rawValue);

    if (digits.length < 8 || digits.length > 20) {
      throw new BadRequestException(
        "Contact value must contain between 8 and 20 digits.",
      );
    }

    return digits;
  }

  private onlyDigits(value: string): string {
    return value.replace(/\D+/g, "");
  }

  private mapPatient(patient: PatientWithContacts): PatientSummaryResponse {
    return {
      id: patient.id,
      tenantId: patient.tenantId,
      fullName: patient.fullName,
      birthDate: patient.birthDate,
      documentNumber: patient.documentNumber,
      notes: patient.notes,
      isActive: patient.isActive,
      mergedIntoPatientId: patient.mergedIntoPatientId,
      mergedAt: patient.mergedAt,
      createdAt: patient.createdAt,
      updatedAt: patient.updatedAt,
      contacts: patient.contacts.map((contact) => ({
        id: contact.id,
        type: contact.type,
        value: contact.value,
        normalizedValue: contact.normalizedValue,
        isPrimary: contact.isPrimary,
      })),
      protocolInstances: patient.patientProtocolInstances.map((protocolInstance) => {
        const nextSession = protocolInstance.sessionAppointments.find(
          (session) =>
            session.status === ProtocolSessionStatus.PLANNED ||
            session.status === ProtocolSessionStatus.SCHEDULED,
        );

        return {
          id: protocolInstance.id,
          procedureProtocolId: protocolInstance.procedureProtocolId,
          procedureProtocolName: protocolInstance.procedureProtocol.name,
          consultationTypeId: protocolInstance.procedureProtocol.consultationTypeId,
          consultationTypeName:
            protocolInstance.procedureProtocol.consultationType.name,
          status: protocolInstance.status,
          sessionsPlanned: protocolInstance.sessionsPlanned,
          sessionsScheduled: protocolInstance.sessionsScheduled,
          sessionsCompleted: protocolInstance.sessionsCompleted,
          nextSessionDate: nextSession?.plannedStartDate ?? null,
          expectedCompletionAt: protocolInstance.expectedCompletionAt,
          updatedAt: protocolInstance.updatedAt,
        };
      }),
    };
  }

  private handleUniqueConstraintError(error: unknown): void {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new ConflictException(
        "Unique constraint violation while saving patient data.",
      );
    }
  }
}
