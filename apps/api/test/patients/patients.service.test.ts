import {
  PatientContactType,
  UserStatus,
} from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PatientsService } from "../../src/modules/patients/patients.service";
import { PatientsAccessService } from "../../src/modules/patients/patients-access.service";
import { buildClinicActor } from "../helpers/actors";

describe("PatientsService", () => {
  const prisma = {
    patient: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      findUniqueOrThrow: vi.fn(),
    },
    patientContact: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      deleteMany: vi.fn(),
      updateMany: vi.fn(),
      update: vi.fn(),
      createMany: vi.fn(),
    },
    appointment: {
      updateMany: vi.fn(),
    },
    slotHold: {
      updateMany: vi.fn(),
    },
    waitlist: {
      updateMany: vi.fn(),
    },
    $transaction: vi.fn(),
  };
  const auditService = {
    record: vi.fn(),
  };
  const accessService = new PatientsAccessService();

  beforeEach(() => {
    prisma.patient.findFirst.mockReset();
    prisma.patient.findMany.mockReset();
    prisma.patient.update.mockReset();
    prisma.patient.findUniqueOrThrow.mockReset();
    prisma.patientContact.findFirst.mockReset();
    prisma.patientContact.findMany.mockReset();
    prisma.patientContact.deleteMany.mockReset();
    prisma.patientContact.updateMany.mockReset();
    prisma.patientContact.update.mockReset();
    prisma.patientContact.createMany.mockReset();
    prisma.appointment.updateMany.mockReset();
    prisma.slotHold.updateMany.mockReset();
    prisma.waitlist.updateMany.mockReset();
    prisma.$transaction.mockReset();
    auditService.record.mockReset();
  });

  it("applies tenant isolation when listing patients", async () => {
    prisma.patient.findMany.mockResolvedValue([]);
    const service = new PatientsService(
      prisma as never,
      accessService,
      auditService as never,
    );

    await service.listPatients(buildClinicActor(), {
      search: "(11) 99999-0000",
      limit: "10",
    });

    expect(prisma.patient.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: "tenant-1",
          OR: expect.arrayContaining([
            expect.objectContaining({
              contacts: expect.objectContaining({
                some: expect.objectContaining({
                  normalizedValue: expect.objectContaining({
                    contains: "11999990000",
                  }),
                }),
              }),
            }),
          ]),
        }),
      }),
    );
  });

  it("delegates to createPatient when find-or-merge finds no existing contact", async () => {
    prisma.patientContact.findMany.mockResolvedValue([]);
    const service = new PatientsService(
      prisma as never,
      accessService,
      auditService as never,
    );
    const createSpy = vi.spyOn(service, "createPatient").mockResolvedValue({
      id: "patient-created",
      fullName: "New Patient",
      birthDate: null,
      documentNumber: null,
      notes: null,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      mergedIntoPatientId: null,
      mergedAt: null,
      contacts: [],
    });

    await service.findOrMergePatient(buildClinicActor(), {
      fullName: "New Patient",
      contacts: [
        {
          type: PatientContactType.WHATSAPP,
          value: "+55 11 99999-0000",
          isPrimary: true,
        },
      ],
    });

    expect(createSpy).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        fullName: "New Patient",
        contacts: expect.any(Array),
      }),
    );
    expect(prisma.patientContact.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: "tenant-1",
        }),
      }),
    );
  });

  it("merges duplicate patients without losing related operational records", async () => {
    prisma.patientContact.findMany.mockResolvedValueOnce([
      { patientId: "patient-a" },
      { patientId: "patient-b" },
    ]);

    const canonicalBefore = {
      id: "patient-a",
      tenantId: "tenant-1",
      fullName: "Patient Canonical",
      birthDate: null,
      documentNumber: null,
      notes: null,
      isActive: true,
      mergedIntoPatientId: null,
      mergedAt: null,
      createdAt: new Date("2026-03-01T00:00:00.000Z"),
      updatedAt: new Date("2026-03-01T00:00:00.000Z"),
      patientProtocolInstances: [],
      contacts: [
        {
          id: "contact-a",
          tenantId: "tenant-1",
          patientId: "patient-a",
          type: PatientContactType.WHATSAPP,
          value: "+55 11 99999-0000",
          normalizedValue: "11999990000",
          isPrimary: true,
          createdAt: new Date("2026-03-01T00:00:00.000Z"),
          updatedAt: new Date("2026-03-01T00:00:00.000Z"),
        },
      ],
    };
    const duplicate = {
      ...canonicalBefore,
      id: "patient-b",
      createdAt: new Date("2026-03-02T00:00:00.000Z"),
      contacts: [],
    };
    const finalPatient = {
      ...canonicalBefore,
    };
    const tx = {
      patient: {
        findMany: vi.fn().mockResolvedValue([canonicalBefore, duplicate]),
        update: vi.fn().mockResolvedValue(null),
        findUniqueOrThrow: vi
          .fn()
          .mockResolvedValueOnce(canonicalBefore)
          .mockResolvedValueOnce(finalPatient),
      },
      patientContact: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findMany: vi.fn().mockResolvedValue(canonicalBefore.contacts),
        createMany: vi.fn().mockResolvedValue({ count: 0 }),
        update: vi.fn().mockResolvedValue(null),
      },
      appointment: {
        updateMany: vi.fn().mockResolvedValue({ count: 2 }),
      },
      slotHold: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      waitlist: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    prisma.$transaction.mockImplementation(async (operation: (client: typeof tx) => Promise<unknown>) =>
      operation(tx),
    );

    const service = new PatientsService(
      prisma as never,
      accessService,
      auditService as never,
    );

    const result = await service.findOrMergePatient(buildClinicActor(), {
      fullName: "Patient Canonical",
      contacts: [
        {
          type: PatientContactType.WHATSAPP,
          value: "+55 11 99999-0000",
          isPrimary: true,
        },
      ],
    });

    expect(tx.appointment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId: "tenant-1",
          patientId: "patient-b",
        },
        data: {
          patientId: "patient-a",
        },
      }),
    );
    expect(tx.slotHold.updateMany).toHaveBeenCalled();
    expect(tx.waitlist.updateMany).toHaveBeenCalled();
    expect(tx.patientContact.updateMany).toHaveBeenCalled();
    expect(tx.patient.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "patient-b" },
        data: expect.objectContaining({
          mergedIntoPatientId: "patient-a",
          isActive: false,
        }),
      }),
    );
    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "PATIENT_MERGED",
        targetId: "patient-a",
      }),
      tx,
    );
    expect(result.id).toBe("patient-a");
    expect(result.isActive).toBe(true);
  });

  it("updates automated messaging preference for a patient contact", async () => {
    prisma.patientContact.findFirst.mockResolvedValue({
      id: "contact-1",
      patientId: "patient-1",
      allowAutomatedMessaging: true,
    });

    const tx = {
      patientContact: {
        update: vi.fn().mockResolvedValue({
          id: "contact-1",
          patientId: "patient-1",
          allowAutomatedMessaging: false,
          automatedMessagingOptedOutAt: new Date("2026-04-04T18:00:00.000Z"),
          updatedAt: new Date("2026-04-04T18:00:00.000Z"),
        }),
      },
    };
    prisma.$transaction.mockImplementation(async (operation: (client: typeof tx) => Promise<unknown>) =>
      operation(tx),
    );

    const service = new PatientsService(
      prisma as never,
      accessService,
      auditService as never,
    );

    const result = await service.updateContactAutomatedMessagingPreference(
      buildClinicActor(),
      "patient-1",
      "contact-1",
      {
        enabled: false,
        reason: "Paciente solicitou apenas contato humano.",
      },
    );

    expect(tx.patientContact.update).toHaveBeenCalledWith({
      where: {
        id: "contact-1",
      },
      data: expect.objectContaining({
        allowAutomatedMessaging: false,
      }),
      select: expect.any(Object),
    });
    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "PATIENT_CONTACT_AUTOMATED_MESSAGING_UPDATED",
        targetId: "contact-1",
        metadata: expect.objectContaining({
          patientId: "patient-1",
          enabled: false,
        }),
      }),
      tx,
    );
    expect(result).toEqual({
      patientId: "patient-1",
      contactId: "contact-1",
      allowAutomatedMessaging: false,
      automatedMessagingOptedOutAt: "2026-04-04T18:00:00.000Z",
      updatedAt: "2026-04-04T18:00:00.000Z",
    });
  });

  it("preserves automated messaging flags when updating existing contacts", async () => {
    prisma.patient.findFirst.mockResolvedValue({
      id: "patient-1",
      tenantId: "tenant-1",
      mergedIntoPatientId: null,
      contacts: [
        {
          id: "contact-1",
          tenantId: "tenant-1",
          patientId: "patient-1",
          type: PatientContactType.WHATSAPP,
          value: "+55 11 99999-0000",
          normalizedValue: "5511999990000",
          isPrimary: true,
          allowAutomatedMessaging: false,
          automatedMessagingOptedOutAt: new Date("2026-04-04T17:00:00.000Z"),
          createdAt: new Date("2026-04-01T00:00:00.000Z"),
          updatedAt: new Date("2026-04-04T17:00:00.000Z"),
        },
      ],
    });
    prisma.patientContact.findMany.mockResolvedValue([]);

    const tx = {
      patient: {
        update: vi.fn().mockResolvedValue(null),
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          id: "patient-1",
          tenantId: "tenant-1",
          fullName: "Patient Updated",
          birthDate: null,
          documentNumber: null,
          notes: null,
          isActive: true,
          mergedIntoPatientId: null,
          mergedAt: null,
          createdAt: new Date("2026-04-01T00:00:00.000Z"),
          updatedAt: new Date("2026-04-04T18:00:00.000Z"),
          contacts: [
            {
              id: "contact-1",
              tenantId: "tenant-1",
              patientId: "patient-1",
              type: PatientContactType.WHATSAPP,
              value: "+55 (11) 99999-0000",
              normalizedValue: "5511999990000",
              isPrimary: true,
              allowAutomatedMessaging: false,
              automatedMessagingOptedOutAt: new Date("2026-04-04T17:00:00.000Z"),
              createdAt: new Date("2026-04-01T00:00:00.000Z"),
              updatedAt: new Date("2026-04-04T18:00:00.000Z"),
            },
          ],
          patientProtocolInstances: [],
        }),
      },
      patientContact: {
        findMany: vi
          .fn()
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([
            {
              type: PatientContactType.WHATSAPP,
              normalizedValue: "5511999990000",
            },
          ]),
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        createMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
    };
    prisma.$transaction.mockImplementation(async (operation: (client: typeof tx) => Promise<unknown>) =>
      operation(tx),
    );

    const service = new PatientsService(
      prisma as never,
      accessService,
      auditService as never,
    );

    await service.updatePatient(buildClinicActor(), "patient-1", {
      contacts: [
        {
          type: PatientContactType.WHATSAPP,
          value: "+55 (11) 99999-0000",
          isPrimary: true,
        },
      ],
    });

    expect(tx.patientContact.deleteMany).toHaveBeenCalledWith({
      where: {
        tenantId: "tenant-1",
        patientId: "patient-1",
        NOT: {
          OR: [
            {
              type: PatientContactType.WHATSAPP,
              normalizedValue: "5511999990000",
            },
          ],
        },
      },
    });
    expect(tx.patientContact.updateMany).toHaveBeenCalledWith({
      where: {
        tenantId: "tenant-1",
        patientId: "patient-1",
        type: PatientContactType.WHATSAPP,
        normalizedValue: "5511999990000",
      },
      data: {
        value: "+55 (11) 99999-0000",
        isPrimary: true,
      },
    });
    expect(tx.patientContact.createMany).not.toHaveBeenCalled();
  });
});
