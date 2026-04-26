import { NotFoundException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MessageThreadsService } from "../../src/modules/messaging/message-threads.service";

describe("MessageThreadsService - Tenant Isolation (CRITICAL)", () => {
  const prisma = {
    messageThread: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    messageEvent: {
      create: vi.fn(),
    },
    messageThreadResolution: {
      create: vi.fn(),
    },
    patient: {
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
    log: vi.fn(),
    record: vi.fn(),
  };

  const messagingGateway = {
    emitThreadActivity: vi.fn(),
    emitThreadUpdated: vi.fn(),
  };

  beforeEach(() => {
    prisma.messageThread.findFirst.mockReset();
    prisma.messageThread.findMany.mockReset();
    prisma.messageThread.update.mockReset();
    prisma.messageEvent.create.mockReset();
    prisma.messageThreadResolution.create.mockReset();
    prisma.patient.findFirst.mockReset();
    prisma.$transaction.mockReset();
    accessService.resolveActiveTenantId.mockReset();
    providerFactory.getAdapter.mockReset();
    auditService.log.mockReset();
    auditService.record.mockReset();
    messagingGateway.emitThreadActivity.mockReset();
    messagingGateway.emitThreadUpdated.mockReset();
  });

  it("CRITICAL: prevents cross-tenant thread access - hides thread from other tenant", async () => {
    // Setup: Thread belongs to tenant-1, user from tenant-2 tries to access it
    const actor = {
      id: "user-from-tenant-2",
      email: "user@tenant2.local",
      fullName: "User Tenant 2",
      status: "ACTIVE",
      profile: "clinic",
      roles: ["RECEPTION"],
      tenantIds: ["tenant-2"],
      activeTenantId: "tenant-2",
      linkedProfessionalId: null,
    };

    const threadBelongingToTenant1 = {
      id: "thread-123",
      tenantId: "tenant-1", // Thread belongs to tenant-1
      patientDisplayName: "Patient Aurora",
      lastMessagePreview: "Hi there",
      handoffRequests: [],
    };

    // Actor belongs to tenant-2
    accessService.resolveActiveTenantId.mockReturnValue("tenant-2");

    // When querying by tenantId=tenant-2, findFirst should NOT return thread from tenant-1
    prisma.messageThread.findFirst.mockResolvedValue(null);

    const service = new MessageThreadsService(
      prisma as never,
      accessService as never,
      providerFactory as never,
      auditService as never,
      messagingGateway as never,
    );

    // Attempt to access thread-123 from tenant-2 context should fail
    await expect(
      service.getThreadById(actor, "thread-123"),
    ).rejects.toBeInstanceOf(NotFoundException);

    // Verify that Prisma was called with tenant isolation filter
    expect(prisma.messageThread.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "thread-123",
          tenantId: "tenant-2", // CRITICAL: Must filter by actor's tenant
        }),
      }),
    );
  });

  it("CRITICAL: allows thread access only within same tenant", async () => {
    // Setup: Thread and user both belong to tenant-1
    const actor = {
      id: "user-from-tenant-1",
      email: "user@tenant1.local",
      fullName: "User Tenant 1",
      status: "ACTIVE",
      profile: "clinic",
      roles: ["RECEPTION"],
      tenantIds: ["tenant-1"],
      activeTenantId: "tenant-1",
      linkedProfessionalId: null,
    };

    const threadBelongingToTenant1 = {
      id: "thread-123",
      tenantId: "tenant-1",
      patientDisplayName: "Patient Aurora",
      patientId: "patient-1",
      lastMessagePreview: "Hi there",
      handoffRequests: [],
      integrationConnection: { id: "conn-1" },
      patient: {
        id: "patient-1",
        fullName: "Patient Aurora",
        birthDate: null,
        documentNumber: null,
        notes: null,
        contacts: [],
      },
      messageEvents: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    accessService.resolveActiveTenantId.mockReturnValue("tenant-1");
    prisma.messageThread.findFirst.mockResolvedValue(threadBelongingToTenant1);

    const service = new MessageThreadsService(
      prisma as never,
      accessService as never,
      providerFactory as never,
      auditService as never,
      messagingGateway as never,
    );

    // Should successfully retrieve thread within same tenant
    const result = await service.getThreadById(actor, "thread-123");

    expect(result).toBeDefined();
    expect(result.id).toBe("thread-123");

    // Verify that Prisma was called with correct tenant filter
    expect(prisma.messageThread.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "thread-123",
          tenantId: "tenant-1", // Correctly filters by actor's active tenant
        }),
      }),
    );
  });

  it("CRITICAL: list threads respects tenant boundary", async () => {
    // Setup: User from tenant-1 lists threads
    const actor = {
      id: "user-from-tenant-1",
      email: "user@tenant1.local",
      fullName: "User Tenant 1",
      status: "ACTIVE",
      profile: "clinic",
      roles: ["RECEPTION"],
      tenantIds: ["tenant-1"],
      activeTenantId: "tenant-1",
      linkedProfessionalId: null,
    };

    const tenant1Threads = [
      {
        id: "thread-1",
        tenantId: "tenant-1",
        patientDisplayName: "Patient 1",
        lastMessagePreview: "Message 1",
        handoffRequests: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: "thread-2",
        tenantId: "tenant-1",
        patientDisplayName: "Patient 2",
        lastMessagePreview: "Message 2",
        handoffRequests: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    accessService.resolveActiveTenantId.mockReturnValue("tenant-1");
    prisma.messageThread.findMany.mockResolvedValue(tenant1Threads);

    const service = new MessageThreadsService(
      prisma as never,
      accessService as never,
      providerFactory as never,
      auditService as never,
      messagingGateway as never,
    );

    const result = await service.listThreads(actor, {});

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("thread-1");
    expect(result[1].id).toBe("thread-2");

    // Verify that Prisma was called with tenant filter
    expect(prisma.messageThread.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: "tenant-1", // CRITICAL: Must filter by actor's tenant
        }),
      }),
    );
  });

  it("emits realtime events when sending outbound message", async () => {
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

    const service = new MessageThreadsService(
      prisma as never,
      accessService as never,
      providerFactory as never,
      auditService as never,
      messagingGateway as never,
    );

    accessService.resolveActiveTenantId.mockReturnValue("tenant-1");

    const baseThread = {
      id: "thread-rt-1",
      tenantId: "tenant-1",
      patientId: "patient-1",
      integrationConnectionId: "conn-1",
      channel: "WHATSAPP",
      status: "IN_HANDOFF",
      patientDisplayName: "Paciente RT",
      contactDisplayValue: "11999998888",
      normalizedContactValue: "5511999998888",
      externalThreadId: null,
      lastMessagePreview: "Oi",
      lastMessageAt: new Date("2026-03-23T12:05:00.000Z"),
      lastInboundAt: null,
      lastOutboundAt: null,
      closedAt: null,
      createdAt: new Date("2026-03-23T11:55:00.000Z"),
      updatedAt: new Date("2026-03-23T12:05:00.000Z"),
      integrationConnection: {
        id: "conn-1",
        provider: "WHATSAPP_MOCK",
        displayName: "Mock",
        externalAccountId: null,
        status: "ACTIVE",
        config: null,
        phoneNumber: null,
      },
      patient: {
        id: "patient-1",
        fullName: "Paciente RT",
        birthDate: null,
        documentNumber: null,
        notes: null,
        contacts: [],
      },
      handoffRequests: [
        {
          id: "handoff-1",
          status: "ASSIGNED",
          source: "AUTOMATIC",
          priority: "HIGH",
          reason: "Need human",
          note: null,
          closedNote: null,
          openedByUserId: null,
          assignedToUserId: "reception-1",
          closedByUserId: null,
          assignedAt: new Date("2026-03-23T12:00:00.000Z"),
          openedAt: new Date("2026-03-23T12:00:00.000Z"),
          closedAt: null,
          createdAt: new Date("2026-03-23T12:00:00.000Z"),
          updatedAt: new Date("2026-03-23T12:00:00.000Z"),
          openedByUser: null,
          assignedToUser: {
            id: "reception-1",
            fullName: "Reception Tenant 1",
            email: "reception@tenant1.local",
          },
          closedByUser: null,
        },
      ],
      messageEvents: [],
    };

    const updatedThread = {
      ...baseThread,
      lastMessagePreview: "Pode me ajudar?",
      lastMessageAt: new Date("2026-03-23T12:10:00.000Z"),
    };

    vi
      .spyOn(service, "findThreadDetailOrThrow")
      .mockResolvedValue(baseThread as never);
    vi.spyOn(service as never, "getThreadDetailByTenantId").mockResolvedValue({
      id: "thread-rt-1",
      tenantId: "tenant-1",
      patientId: "patient-1",
      integrationConnectionId: "conn-1",
      channel: "WHATSAPP",
      status: "IN_HANDOFF",
      patientDisplayName: "Paciente RT",
      contactDisplayValue: "11999998888",
      normalizedContactValue: "5511999998888",
      lastMessagePreview: "Pode me ajudar?",
      lastMessageAt: updatedThread.lastMessageAt.toISOString(),
      lastInboundAt: null,
      lastOutboundAt: updatedThread.lastMessageAt.toISOString(),
      handoffOpen: true,
      openHandoff: null,
      createdAt: updatedThread.createdAt.toISOString(),
      updatedAt: updatedThread.updatedAt.toISOString(),
      integration: {
        id: "conn-1",
        displayName: "Mock",
        provider: "WHATSAPP_MOCK",
        phoneNumber: null,
        externalAccountId: null,
        status: "ACTIVE",
      },
      patient: null,
      events: [],
      handoffs: [],
    });

    providerFactory.getAdapter.mockReturnValue({
      sendTextMessage: vi.fn().mockResolvedValue({
        providerMessageId: "provider-msg-1",
        externalThreadId: null,
        metadata: null,
      }),
    });

    prisma.$transaction.mockImplementation(async (callback: any) =>
      callback({
        messageEvent: { create: vi.fn().mockResolvedValue({ id: "event-human-1" }) },
        messageThread: { update: vi.fn() },
      }),
    );

    await service.sendMessage(actor as never, "thread-rt-1", {
      text: "Pode me ajudar?",
    });

    expect(messagingGateway.emitThreadActivity).toHaveBeenCalledWith(
      "tenant-1",
      expect.objectContaining({
        threadId: "thread-rt-1",
        direction: "OUTBOUND",
        eventType: "MESSAGE_SENT",
      }),
    );
    expect(messagingGateway.emitThreadUpdated).toHaveBeenCalledWith("tenant-1", {
      threadId: "thread-rt-1",
      status: "IN_HANDOFF",
      lastMessagePreview: "Pode me ajudar?",
      lastMessageAt: updatedThread.lastMessageAt.toISOString(),
    });
  });

  it("allows automated outbound dispatch to reopen a closed thread without human actor", async () => {
    const service = new MessageThreadsService(
      prisma as never,
      accessService as never,
      providerFactory as never,
      auditService as never,
      messagingGateway as never,
    );

    const closedThread = {
      id: "thread-auto-1",
      tenantId: "tenant-1",
      patientId: "patient-1",
      integrationConnectionId: "conn-1",
      channel: "WHATSAPP",
      status: "CLOSED",
      patientDisplayName: "Paciente Auto",
      contactDisplayValue: "11999990000",
      normalizedContactValue: "5511999990000",
      externalThreadId: null,
      lastMessagePreview: "Encerrado",
      lastMessageAt: new Date("2026-04-04T08:00:00.000Z"),
      lastInboundAt: null,
      lastOutboundAt: null,
      closedAt: new Date("2026-04-04T08:00:00.000Z"),
      createdAt: new Date("2026-04-04T07:00:00.000Z"),
      updatedAt: new Date("2026-04-04T08:00:00.000Z"),
      integrationConnection: {
        id: "conn-1",
        provider: "WHATSAPP_MOCK",
        displayName: "Mock",
        externalAccountId: null,
        status: "ACTIVE",
        config: null,
        phoneNumber: null,
      },
      patient: {
        id: "patient-1",
        fullName: "Paciente Auto",
        birthDate: null,
        documentNumber: null,
        notes: null,
        contacts: [],
      },
      handoffRequests: [],
      messageEvents: [],
    };

    vi.spyOn(service, "findThreadDetailOrThrow").mockResolvedValue(closedThread as never);
    vi.spyOn(service as never, "getThreadDetailByTenantId").mockResolvedValue({
      id: "thread-auto-1",
      tenantId: "tenant-1",
      patientId: "patient-1",
      integrationConnectionId: "conn-1",
      channel: "WHATSAPP",
      status: "OPEN",
      patientDisplayName: "Paciente Auto",
      contactDisplayValue: "11999990000",
      normalizedContactValue: "5511999990000",
      lastMessagePreview: "Lembrete da consulta",
      lastMessageAt: "2026-04-04T09:00:00.000Z",
      lastInboundAt: null,
      lastOutboundAt: "2026-04-04T09:00:00.000Z",
      handoffOpen: false,
      openHandoff: null,
      createdAt: "2026-04-04T07:00:00.000Z",
      updatedAt: "2026-04-04T09:00:00.000Z",
      integration: {
        id: "conn-1",
        displayName: "Mock",
        provider: "WHATSAPP_MOCK",
        phoneNumber: null,
        externalAccountId: null,
        status: "ACTIVE",
      },
      patient: null,
      events: [],
      handoffs: [],
    });

    providerFactory.getAdapter.mockReturnValue({
      sendTextMessage: vi.fn().mockResolvedValue({
        providerMessageId: "provider-msg-auto-1",
        externalThreadId: null,
        metadata: null,
      }),
    });

    const tx = {
      messageEvent: {
        create: vi.fn().mockResolvedValue({ id: "event-auto-1" }),
      },
      messageThread: {
        update: vi.fn().mockResolvedValue(null),
      },
    };
    prisma.$transaction.mockImplementation(async (callback: any) => callback(tx));

    const result = await service.sendAutomatedMessageForTenant(
      "tenant-1",
      "thread-auto-1",
      {
        text: "Lembrete da consulta",
      },
      {
        correlationId: "corr-auto-1",
        metadata: {
          origin: "APPOINTMENT_FOLLOW_UP",
        },
      },
    );

    expect(tx.messageEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actorUserId: null,
          eventType: "MESSAGE_SENT",
          metadata: expect.objectContaining({
            source: "AUTOMATION",
            correlationId: "corr-auto-1",
            origin: "APPOINTMENT_FOLLOW_UP",
          }),
        }),
      }),
    );
    expect(tx.messageThread.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "thread-auto-1",
        },
        data: expect.objectContaining({
          status: "OPEN",
          closedAt: null,
        }),
      }),
    );
    expect(result.messageEventId).toBe("event-auto-1");
    expect(result.thread.status).toBe("OPEN");
  });

  it("persists a human thread resolution fact when reception closes a thread", async () => {
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

    const service = new MessageThreadsService(
      prisma as never,
      accessService as never,
      providerFactory as never,
      auditService as never,
      messagingGateway as never,
    );

    accessService.resolveActiveTenantId.mockReturnValue("tenant-1");

    const thread = {
      id: "thread-resolve-1",
      tenantId: "tenant-1",
      patientId: "patient-1",
      integrationConnectionId: "conn-1",
      channel: "WHATSAPP",
      status: "OPEN",
      patientDisplayName: "Paciente Resolve",
      contactDisplayValue: "11999997777",
      normalizedContactValue: "5511999997777",
      externalThreadId: null,
      lastMessagePreview: "Tudo certo",
      lastMessageAt: new Date("2026-04-05T11:00:00.000Z"),
      lastInboundAt: new Date("2026-04-05T10:55:00.000Z"),
      lastOutboundAt: new Date("2026-04-05T11:00:00.000Z"),
      closedAt: null,
      createdAt: new Date("2026-04-05T10:00:00.000Z"),
      updatedAt: new Date("2026-04-05T11:00:00.000Z"),
      integrationConnection: {
        id: "conn-1",
        provider: "WHATSAPP_MOCK",
        displayName: "Mock",
        externalAccountId: null,
        status: "ACTIVE",
        config: null,
        phoneNumber: null,
      },
      patient: {
        id: "patient-1",
        fullName: "Paciente Resolve",
        birthDate: null,
        documentNumber: null,
        notes: null,
        contacts: [],
      },
      handoffRequests: [],
      messageEvents: [],
    };

    vi.spyOn(service, "findThreadDetailOrThrow").mockResolvedValue(thread as never);
    vi.spyOn(service as never, "getThreadDetailByTenantId").mockResolvedValue({
      id: "thread-resolve-1",
      tenantId: "tenant-1",
      patientId: "patient-1",
      integrationConnectionId: "conn-1",
      channel: "WHATSAPP",
      status: "CLOSED",
      patientDisplayName: "Paciente Resolve",
      contactDisplayValue: "11999997777",
      normalizedContactValue: "5511999997777",
      lastMessagePreview: "Tudo certo",
      lastMessageAt: "2026-04-05T11:00:00.000Z",
      lastInboundAt: "2026-04-05T10:55:00.000Z",
      lastOutboundAt: "2026-04-05T11:00:00.000Z",
      handoffOpen: false,
      openHandoff: null,
      createdAt: "2026-04-05T10:00:00.000Z",
      updatedAt: "2026-04-05T11:00:00.000Z",
      integration: {
        id: "conn-1",
        displayName: "Mock",
        provider: "WHATSAPP_MOCK",
        phoneNumber: null,
        externalAccountId: null,
        status: "ACTIVE",
      },
      patient: null,
      events: [],
      handoffs: [],
    });

    const tx = {
      messageThread: {
        update: vi.fn(),
      },
      messageEvent: {
        create: vi.fn().mockResolvedValue({ id: "event-resolved-1" }),
      },
      messageThreadResolution: {
        create: vi.fn(),
      },
    };
    prisma.$transaction.mockImplementation(async (callback: any) => callback(tx));

    await service.resolveThread(actor as never, "thread-resolve-1", {
      note: "Paciente atendido",
    });

    expect(tx.messageThreadResolution.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: "tenant-1",
        threadId: "thread-resolve-1",
        patientId: "patient-1",
        messageEventId: "event-resolved-1",
        resolvedByUserId: "reception-1",
        actorType: "HUMAN",
        note: "Paciente atendido",
      }),
    });
  });
});
