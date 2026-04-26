import { beforeEach, describe, expect, it, vi } from "vitest";
import { MessagingPatientLinkService } from "../../src/modules/messaging/messaging-patient-link.service";

describe("MessagingPatientLinkService", () => {
  const prisma = {
    patientContact: {
      findMany: vi.fn(),
    },
  };

  beforeEach(() => {
    prisma.patientContact.findMany.mockReset();
  });

  it("links the thread only when one distinct patient matches the contact", async () => {
    prisma.patientContact.findMany.mockResolvedValue([
      {
        patientId: "patient-1",
        patient: {
          fullName: "Cliente Aurora",
        },
      },
      {
        patientId: "patient-1",
        patient: {
          fullName: "Cliente Aurora",
        },
      },
    ]);

    const service = new MessagingPatientLinkService(prisma as never);

    const result = await service.resolveByContactValue(
      "tenant-1",
      "(11) 98888-0000",
    );

    expect(result).toEqual({
      normalizedContactValue: "11988880000",
      patientId: "patient-1",
      patientDisplayName: "Cliente Aurora",
    });
  });

  it("keeps the thread unlinked when the same contact resolves to multiple patients", async () => {
    prisma.patientContact.findMany.mockResolvedValue([
      {
        patientId: "patient-1",
        patient: {
          fullName: "Cliente Aurora",
        },
      },
      {
        patientId: "patient-2",
        patient: {
          fullName: "Cliente Solar",
        },
      },
    ]);

    const service = new MessagingPatientLinkService(prisma as never);

    const result = await service.resolveByContactValue(
      "tenant-1",
      "(11) 98888-0000",
    );

    expect(result).toEqual({
      normalizedContactValue: "11988880000",
      patientId: null,
      patientDisplayName: null,
    });
  });
});
