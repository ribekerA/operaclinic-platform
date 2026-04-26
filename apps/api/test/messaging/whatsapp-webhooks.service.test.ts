import { beforeEach, describe, expect, it, vi } from "vitest";
import { WhatsappWebhooksService } from "../../src/modules/messaging/whatsapp-webhooks.service";

describe("WhatsappWebhooksService", () => {
  const prisma = {
    webhookEvent: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn(),
  };

  const connectionsService = {
    resolveConnectionForWebhook: vi.fn(),
  };

  const providerFactory = {
    extractWebhookLookup: vi.fn(),
    getAdapter: vi.fn(),
  };

  const patientLinkService = {
    resolveByContactValue: vi.fn(),
  };

  const abuseProtectionService = {
    assertWithinLimit: vi.fn(),
  };

  const handoffsService = {
    ensureAutomaticHandoffForThread: vi.fn(),
  };

  const agentBridge = {
    routeInboundMessage: vi.fn(),
  };

  const messagingGateway = {
    emitThreadActivity: vi.fn(),
    emitThreadUpdated: vi.fn(),
  };

  beforeEach(() => {
    prisma.webhookEvent.findFirst.mockReset();
    prisma.webhookEvent.create.mockReset();
    prisma.webhookEvent.update.mockReset();
    prisma.$transaction.mockReset();
    connectionsService.resolveConnectionForWebhook.mockReset();
    providerFactory.extractWebhookLookup.mockReset();
    providerFactory.getAdapter.mockReset();
    patientLinkService.resolveByContactValue.mockReset();
    abuseProtectionService.assertWithinLimit.mockReset();
    handoffsService.ensureAutomaticHandoffForThread.mockReset();
    agentBridge.routeInboundMessage.mockReset();
    messagingGateway.emitThreadActivity.mockReset();
    messagingGateway.emitThreadUpdated.mockReset();
  });

  it("deduplicates inbound webhook processing by providerEventId", async () => {
    providerFactory.extractWebhookLookup.mockReturnValue({
      providerAccountId: "phone-number-id-1",
    });
    connectionsService.resolveConnectionForWebhook.mockResolvedValue({
      id: "connection-1",
      tenantId: "tenant-1",
      provider: "WHATSAPP_MOCK",
      displayName: "Mock WhatsApp",
      externalAccountId: "phone-number-id-1",
      config: null,
    });
    providerFactory.getAdapter.mockReturnValue({
      verifyInboundWebhook: vi.fn(),
      parseInboundWebhook: vi.fn().mockResolvedValue([
        {
          providerEventId: "evt-1",
          providerMessageId: "msg-1",
          eventType: "message.received",
          senderPhoneNumber: "11988880000",
          senderDisplayName: "Cliente Aurora",
          messageText: "Oi",
          occurredAt: new Date("2026-03-16T15:00:00.000Z"),
          payload: {
            senderPhoneNumber: "11988880000",
          },
        },
      ]),
    });
    prisma.webhookEvent.findFirst.mockResolvedValue({
      id: "webhook-1",
      threadId: "thread-1",
    });

    const service = new WhatsappWebhooksService(
      prisma as never,
      providerFactory as never,
      connectionsService as never,
      patientLinkService as never,
      abuseProtectionService as never,
      handoffsService as never,
      agentBridge as never,
      messagingGateway as never,
    );

    const result = await service.handleInboundWebhook(
      {
        headers: {},
        ip: "127.0.0.1",
        socket: { remoteAddress: "127.0.0.1" },
      } as never,
      {
        providerAccountId: "phone-number-id-1",
      },
    );

    expect(result).toEqual({
      ok: true,
      threadId: "thread-1",
      eventId: "webhook-1",
    });
    expect(prisma.webhookEvent.findFirst).toHaveBeenCalledWith({
      where: {
        integrationConnectionId: "connection-1",
        providerEventId: "evt-1",
      },
      select: {
        id: true,
        threadId: true,
      },
    });
    expect(prisma.webhookEvent.create).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(messagingGateway.emitThreadActivity).not.toHaveBeenCalled();
    expect(messagingGateway.emitThreadUpdated).not.toHaveBeenCalled();
  });

  it("emits realtime thread events when inbound message is processed", async () => {
    const occurredAt = new Date("2026-03-23T12:00:00.000Z");

    providerFactory.extractWebhookLookup.mockReturnValue({
      providerAccountId: "phone-number-id-1",
    });
    connectionsService.resolveConnectionForWebhook.mockResolvedValue({
      id: "connection-1",
      tenantId: "tenant-1",
      provider: "WHATSAPP_MOCK",
      displayName: "Mock WhatsApp",
      externalAccountId: "phone-number-id-1",
      config: null,
    });
    providerFactory.getAdapter.mockReturnValue({
      verifyInboundWebhook: vi.fn(),
      parseInboundWebhook: vi.fn().mockResolvedValue([
        {
          providerEventId: "evt-2",
          providerMessageId: "msg-2",
          eventType: "message.received",
          senderPhoneNumber: "11988887777",
          senderDisplayName: "Cliente Solar",
          messageText: "Preciso de ajuda",
          occurredAt,
          payload: {
            senderPhoneNumber: "11988887777",
          },
        },
      ]),
    });

    prisma.webhookEvent.findFirst.mockResolvedValue(null);
    prisma.webhookEvent.create.mockResolvedValue({ id: "webhook-2" });
    patientLinkService.resolveByContactValue.mockResolvedValue({
      patientId: "patient-1",
      patientDisplayName: "Cliente Solar",
      normalizedContactValue: "5511988887777",
    });

    const tx = {
      messageThread: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({
          id: "thread-2",
          status: "OPEN",
          patientId: "patient-1",
          lastMessagePreview: "Preciso de ajuda",
          lastMessageAt: occurredAt,
        }),
        update: vi.fn(),
      },
      messageEvent: {
        create: vi
          .fn()
          .mockResolvedValueOnce({ id: "system-event" })
          .mockResolvedValueOnce({ id: "message-event-2" }),
      },
      webhookEvent: {
        update: vi.fn(),
      },
    };

    prisma.$transaction.mockImplementation(async (callback: any) => callback(tx));

    const service = new WhatsappWebhooksService(
      prisma as never,
      providerFactory as never,
      connectionsService as never,
      patientLinkService as never,
      abuseProtectionService as never,
      handoffsService as never,
      agentBridge as never,
      messagingGateway as never,
    );

    const result = await service.handleInboundWebhook(
      {
        headers: {},
        ip: "127.0.0.1",
        socket: { remoteAddress: "127.0.0.1" },
      } as never,
      {
        providerAccountId: "phone-number-id-1",
      },
    );

    expect(result).toEqual({
      ok: true,
      threadId: "thread-2",
      eventId: "message-event-2",
    });

    expect(messagingGateway.emitThreadActivity).toHaveBeenCalledWith("tenant-1", {
      threadId: "thread-2",
      direction: "INBOUND",
      eventType: "MESSAGE_RECEIVED",
      occurredAt: occurredAt.toISOString(),
    });
    expect(messagingGateway.emitThreadUpdated).toHaveBeenCalledWith("tenant-1", {
      threadId: "thread-2",
      status: "OPEN",
      lastMessagePreview: "Preciso de ajuda",
      lastMessageAt: occurredAt.toISOString(),
    });
  });
});
