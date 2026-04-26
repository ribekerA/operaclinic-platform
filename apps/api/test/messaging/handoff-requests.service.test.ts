import { beforeEach, describe, expect, it, vi } from "vitest";
import { HandoffRequestsService } from "../../src/modules/messaging/handoff-requests.service";

describe("HandoffRequestsService", () => {
  const prisma = {
    handoffRequest: {
      findFirst: vi.fn(),
    },
    messageThread: {
      findFirst: vi.fn(),
    },
    $transaction: vi.fn(),
  };

  const accessService = {
    resolveActiveTenantId: vi.fn(),
  };

  const providerFactory = {
    getAdapter: vi.fn(),
  };

  const auditService = {
    record: vi.fn(),
  };

  const messagingGateway = {
    emitNewHandoff: vi.fn(),
    emitHandoffUpdate: vi.fn(),
  };

  beforeEach(() => {
    prisma.handoffRequest.findFirst.mockReset();
    prisma.messageThread.findFirst.mockReset();
    prisma.$transaction.mockReset();
    accessService.resolveActiveTenantId.mockReset();
    auditService.record.mockReset();
    messagingGateway.emitNewHandoff.mockReset();
    messagingGateway.emitHandoffUpdate.mockReset();
  });

  it("persists a human thread resolution fact when closing a handoff with resolveThread", async () => {
    const actor = {
      id: "reception-1",
      email: "reception@tenant1.local",
      fullName: "Reception Tenant 1",
      status: "ACTIVE",
      profile: "clinic",
      roles: ["RECEPTION"],
      tenantIds: ["tenant-1"],
      activeTenantId: "tenant-1",
      linkedProfessionalId: null,
    };

    accessService.resolveActiveTenantId.mockReturnValue("tenant-1");

    prisma.handoffRequest.findFirst.mockResolvedValue({
      id: "handoff-1",
      tenantId: "tenant-1",
      threadId: "thread-1",
      status: "ASSIGNED",
      source: "AUTOMATIC",
      priority: "HIGH",
      reason: "Need help",
      note: null,
      closedNote: null,
      openedByUserId: null,
      assignedToUserId: "reception-1",
      closedByUserId: null,
      assignedAt: new Date("2026-04-05T11:00:00.000Z"),
      openedAt: new Date("2026-04-05T11:00:00.000Z"),
      closedAt: null,
      createdAt: new Date("2026-04-05T11:00:00.000Z"),
      updatedAt: new Date("2026-04-05T11:00:00.000Z"),
      openedByUser: null,
      assignedToUser: {
        id: "reception-1",
        fullName: "Reception Tenant 1",
        email: "reception@tenant1.local",
      },
      closedByUser: null,
      thread: {
        id: "thread-1",
        status: "IN_HANDOFF",
        patientId: "patient-1",
        patientDisplayName: "Paciente",
        contactDisplayValue: "11999997777",
        lastMessagePreview: "Preciso remarcar",
        lastMessageAt: new Date("2026-04-05T11:05:00.000Z"),
      },
    });

    prisma.messageThread.findFirst.mockResolvedValue({
      id: "thread-1",
      tenantId: "tenant-1",
      patientId: "patient-1",
      integrationConnectionId: "conn-1",
      status: "IN_HANDOFF",
      normalizedContactValue: "5511999997777",
      integrationConnection: {
        id: "conn-1",
        provider: "WHATSAPP_MOCK",
        displayName: "Mock",
        externalAccountId: null,
        config: null,
      },
    });

    const tx = {
      handoffRequest: {
        update: vi.fn().mockResolvedValue({
          id: "handoff-1",
          tenantId: "tenant-1",
          threadId: "thread-1",
          status: "CLOSED",
          source: "AUTOMATIC",
          priority: "HIGH",
          reason: "Need help",
          note: null,
          closedNote: "Recepcao assumiu",
          openedByUserId: null,
          assignedToUserId: "reception-1",
          closedByUserId: "reception-1",
          assignedAt: new Date("2026-04-05T11:00:00.000Z"),
          openedAt: new Date("2026-04-05T11:00:00.000Z"),
          closedAt: new Date("2026-04-05T11:10:00.000Z"),
          createdAt: new Date("2026-04-05T11:00:00.000Z"),
          updatedAt: new Date("2026-04-05T11:10:00.000Z"),
          openedByUser: null,
          assignedToUser: {
            id: "reception-1",
            fullName: "Reception Tenant 1",
            email: "reception@tenant1.local",
          },
          closedByUser: {
            id: "reception-1",
            fullName: "Reception Tenant 1",
            email: "reception@tenant1.local",
          },
          thread: {
            id: "thread-1",
            status: "CLOSED",
            patientId: "patient-1",
            patientDisplayName: "Paciente",
            contactDisplayValue: "11999997777",
            lastMessagePreview: "Preciso remarcar",
            lastMessageAt: new Date("2026-04-05T11:05:00.000Z"),
          },
        }),
      },
      messageThread: {
        update: vi.fn(),
      },
      messageEvent: {
        create: vi
          .fn()
          .mockResolvedValueOnce({ id: "handoff-closed-event-1" })
          .mockResolvedValueOnce({ id: "thread-resolved-event-1" }),
      },
      messageThreadResolution: {
        create: vi.fn(),
      },
    };

    prisma.$transaction.mockImplementation(async (callback: any) => callback(tx));

    const service = new HandoffRequestsService(
      prisma as never,
      accessService as never,
      providerFactory as never,
      auditService as never,
      messagingGateway as never,
    );

    await service.closeHandoff(actor as never, "handoff-1", {
      note: "Recepcao assumiu",
      resolveThread: true,
    });

    expect(tx.messageThreadResolution.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: "tenant-1",
        threadId: "thread-1",
        patientId: "patient-1",
        handoffRequestId: "handoff-1",
        messageEventId: "thread-resolved-event-1",
        resolvedByUserId: "reception-1",
        actorType: "HUMAN",
        note: "Recepcao assumiu",
      }),
    });
  });
});
