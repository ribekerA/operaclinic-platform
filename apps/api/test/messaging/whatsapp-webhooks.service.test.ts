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
    assertWithinLimit: vi.fn().mockResolvedValue(undefined),
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

  const debounce = {
    schedule: vi.fn(),
  };

  const audioTranscriptionService = {
    processInboundAudio: vi.fn().mockResolvedValue(undefined),
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
    abuseProtectionService.assertWithinLimit.mockResolvedValue(undefined);
    handoffsService.ensureAutomaticHandoffForThread.mockReset();
    agentBridge.routeInboundMessage.mockReset();
    messagingGateway.emitThreadActivity.mockReset();
    messagingGateway.emitThreadUpdated.mockReset();
    debounce.schedule.mockReset();
    audioTranscriptionService.processInboundAudio.mockReset();
    audioTranscriptionService.processInboundAudio.mockResolvedValue(undefined);
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
      debounce as never,
      audioTranscriptionService as never,
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
      debounce as never,
      audioTranscriptionService as never,
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

  it("creates a PENDING AUDIO MessageEvent and dispatches to the transcription pipeline fire-and-forget, bypassing the text debounce", async () => {
    const occurredAt = new Date("2026-03-23T12:00:00.000Z");

    providerFactory.extractWebhookLookup.mockReturnValue({
      providerAccountId: "phone-number-id-1",
    });
    connectionsService.resolveConnectionForWebhook.mockResolvedValue({
      id: "connection-1",
      tenantId: "tenant-1",
      provider: "WHATSAPP_META",
      displayName: "Meta WhatsApp",
      externalAccountId: "phone-number-id-1",
      config: null,
    });
    providerFactory.getAdapter.mockReturnValue({
      verifyInboundWebhook: vi.fn(),
      parseInboundWebhook: vi.fn().mockResolvedValue([
        {
          providerEventId: "wamid-audio-1",
          providerMessageId: "wamid-audio-1",
          eventType: "message.received",
          senderPhoneNumber: "11988887777",
          senderDisplayName: "Cliente Solar",
          messageText: null,
          occurredAt,
          media: {
            mediaId: "media-abc-123",
            mimeType: "audio/ogg",
          },
          payload: {
            senderPhoneNumber: "11988887777",
          },
        },
      ]),
    });

    prisma.webhookEvent.findFirst.mockResolvedValue(null);
    prisma.webhookEvent.create.mockResolvedValue({ id: "webhook-3" });
    patientLinkService.resolveByContactValue.mockResolvedValue({
      patientId: "patient-1",
      patientDisplayName: "Cliente Solar",
      normalizedContactValue: "5511988887777",
    });

    let capturedAudioEventCreateArgs: any;
    const tx = {
      messageThread: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({
          id: "thread-3",
          status: "OPEN",
          patientId: "patient-1",
          lastMessagePreview: "🎤 Mensagem de voz (transcrevendo...)",
          lastMessageAt: occurredAt,
        }),
        update: vi.fn(),
      },
      messageEvent: {
        create: vi.fn().mockImplementation((args: any) => {
          if (args.data.eventType === "AUDIO") {
            capturedAudioEventCreateArgs = args;
            return Promise.resolve({ id: "audio-event-1" });
          }
          return Promise.resolve({ id: "system-event" });
        }),
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
      debounce as never,
      audioTranscriptionService as never,
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
      threadId: "thread-3",
      eventId: "audio-event-1",
    });

    expect(capturedAudioEventCreateArgs.data).toEqual(
      expect.objectContaining({
        eventType: "AUDIO",
        direction: "INBOUND",
        contentText: null,
        metadata: expect.objectContaining({
          mediaId: "media-abc-123",
          mimeType: "audio/ogg",
          transcriptionStatus: "PENDING",
        }),
      }),
    );

    // Fire-and-forget: awaiting handleInboundWebhook already lets the
    // microtask queue drain the .then/.catch chain attached to the call below.
    await Promise.resolve();
    expect(audioTranscriptionService.processInboundAudio).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      threadId: "thread-3",
      eventId: "audio-event-1",
      mediaId: "media-abc-123",
      mimeType: "audio/ogg",
      senderPhoneNumber: "11988887777",
      senderDisplayName: "Cliente Solar",
      patientId: "patient-1",
      connection: {
        provider: "WHATSAPP_META",
        connectionId: "connection-1",
        displayName: "Meta WhatsApp",
        externalAccountId: "phone-number-id-1",
        config: null,
      },
    });

    expect(debounce.schedule).not.toHaveBeenCalled();

    expect(messagingGateway.emitThreadActivity).toHaveBeenCalledWith("tenant-1", {
      threadId: "thread-3",
      direction: "INBOUND",
      eventType: "AUDIO",
      occurredAt: occurredAt.toISOString(),
    });
  });

  it("never propagates a fire-and-forget transcription pipeline rejection back to the webhook response", async () => {
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
          providerEventId: "evt-audio-2",
          providerMessageId: "msg-audio-2",
          eventType: "message.received",
          senderPhoneNumber: "11988880000",
          senderDisplayName: "Cliente Aurora",
          messageText: null,
          occurredAt,
          media: {
            mediaId: "media-xyz-999",
            mimeType: "audio/ogg",
          },
          payload: {},
        },
      ]),
    });

    prisma.webhookEvent.findFirst.mockResolvedValue(null);
    prisma.webhookEvent.create.mockResolvedValue({ id: "webhook-4" });
    patientLinkService.resolveByContactValue.mockResolvedValue({
      patientId: "patient-1",
      patientDisplayName: "Cliente Aurora",
      normalizedContactValue: "5511988880000",
    });

    const tx = {
      messageThread: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({
          id: "thread-4",
          status: "OPEN",
          patientId: "patient-1",
          lastMessagePreview: "🎤 Mensagem de voz (transcrevendo...)",
          lastMessageAt: occurredAt,
        }),
        update: vi.fn(),
      },
      messageEvent: {
        create: vi
          .fn()
          .mockResolvedValueOnce({ id: "system-event-2" })
          .mockResolvedValueOnce({ id: "audio-event-2" }),
      },
      webhookEvent: {
        update: vi.fn(),
      },
    };

    prisma.$transaction.mockImplementation(async (callback: any) => callback(tx));

    // This test exercises the webhook layer only up to dispatch — the guard
    // that actually rejects/hands-off an unsupported provider lives inside
    // AudioTranscriptionService (covered in audio-transcription.service.test.ts).
    // Here we only assert the webhook always dispatches fire-and-forget and
    // never throws even if the pipeline call rejects.
    audioTranscriptionService.processInboundAudio.mockRejectedValueOnce(
      new Error("PROVIDER_UNSUPPORTED"),
    );

    const service = new WhatsappWebhooksService(
      prisma as never,
      providerFactory as never,
      connectionsService as never,
      patientLinkService as never,
      abuseProtectionService as never,
      handoffsService as never,
      agentBridge as never,
      messagingGateway as never,
      debounce as never,
      audioTranscriptionService as never,
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
      threadId: "thread-4",
      eventId: "audio-event-2",
    });
    expect(audioTranscriptionService.processInboundAudio).toHaveBeenCalledTimes(1);

    // A pipeline crash must never propagate back to the webhook's response —
    // it's swallowed by the .catch() attached in the fire-and-forget call.
    await Promise.resolve();
    await Promise.resolve();
  });
});
