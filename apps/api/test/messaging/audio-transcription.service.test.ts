import { beforeEach, describe, expect, it, vi } from "vitest";
import { AudioTranscriptionService } from "../../src/modules/messaging/audio-transcription.service";
import type { ProcessInboundAudioInput } from "../../src/modules/messaging/audio-transcription.service";

describe("AudioTranscriptionService", () => {
  const prisma = {
    messageEvent: {
      update: vi.fn(),
    },
    messageThread: {
      update: vi.fn(),
    },
  };

  const providerFactory = {
    getAdapter: vi.fn(),
  };

  const tenantSettings = {
    getAudioSettings: vi.fn(),
  };

  const planEntitlements = {
    checkAiConversationQuota: vi.fn(),
    checkAudioTranscriptionQuota: vi.fn(),
  };

  const abuseProtectionService = {
    checkAudioSenderRateLimit: vi.fn(),
  };

  const transcriptionFactory = {
    getProvider: vi.fn(),
    getProviderName: vi.fn(),
  };

  const debounce = {
    schedule: vi.fn(),
  };

  const handoffsService = {
    ensureAutomaticHandoffForThread: vi.fn(),
  };

  const auditService = {
    record: vi.fn(),
  };

  const messagingGateway = {
    emitThreadActivity: vi.fn(),
    emitThreadUpdated: vi.fn(),
  };

  const baseInput: ProcessInboundAudioInput = {
    tenantId: "tenant-1",
    threadId: "thread-1",
    eventId: "event-1",
    mediaId: "media-1",
    mimeType: "audio/ogg",
    senderPhoneNumber: "11988887777",
    senderDisplayName: "Cliente Solar",
    patientId: "patient-1",
    connection: {
      provider: "WHATSAPP_META" as never,
      connectionId: "connection-1",
      displayName: "Meta WhatsApp",
      externalAccountId: "phone-number-id-1",
      config: null,
    },
  };

  let adapter: { downloadMedia: ReturnType<typeof vi.fn>; getMediaMetadata: ReturnType<typeof vi.fn> };
  let transcriptionProvider: { transcribe: ReturnType<typeof vi.fn> };

  function buildService(): AudioTranscriptionService {
    return new AudioTranscriptionService(
      prisma as never,
      providerFactory as never,
      tenantSettings as never,
      planEntitlements as never,
      abuseProtectionService as never,
      transcriptionFactory as never,
      debounce as never,
      handoffsService as never,
      auditService as never,
      messagingGateway as never,
    );
  }

  beforeEach(() => {
    prisma.messageEvent.update.mockReset().mockResolvedValue({});
    prisma.messageThread.update.mockReset().mockResolvedValue({
      status: "OPEN",
      lastMessagePreview: "preview",
      lastMessageAt: new Date("2026-03-23T12:00:00.000Z"),
    });

    adapter = {
      downloadMedia: vi.fn().mockResolvedValue({
        buffer: Buffer.from("fake-audio-bytes"),
        mimeType: "audio/ogg",
        sizeBytes: 16,
      }),
      getMediaMetadata: vi.fn().mockResolvedValue({
        mimeType: "audio/ogg",
        sizeBytes: 10_000,
      }),
    };
    providerFactory.getAdapter.mockReset().mockReturnValue(adapter);

    tenantSettings.getAudioSettings.mockReset().mockResolvedValue({
      enabled: true,
      maxDurationSeconds: 120,
      minConfidence: 0.6,
    });

    planEntitlements.checkAiConversationQuota
      .mockReset()
      .mockResolvedValue({ allowed: true, limit: 200, usedThisMonth: 5 });
    planEntitlements.checkAudioTranscriptionQuota
      .mockReset()
      .mockResolvedValue({ allowed: true, limit: 3_000, usedSecondsThisMonth: 100 });

    abuseProtectionService.checkAudioSenderRateLimit
      .mockReset()
      .mockResolvedValue({ allowed: true, limit: 10 });

    transcriptionProvider = {
      transcribe: vi.fn().mockResolvedValue({
        text: "Olá, quero agendar uma consulta",
        confidence: 0.9,
        durationSeconds: 12,
      }),
    };
    transcriptionFactory.getProvider.mockReset().mockReturnValue(transcriptionProvider);
    transcriptionFactory.getProviderName.mockReset().mockReturnValue("mock");

    debounce.schedule.mockReset();
    handoffsService.ensureAutomaticHandoffForThread.mockReset().mockResolvedValue({});
    auditService.record.mockReset().mockResolvedValue(undefined);
    messagingGateway.emitThreadActivity.mockReset();
    messagingGateway.emitThreadUpdated.mockReset();
  });

  it("rejects with DISABLED and never touches the provider when audio is disabled for the tenant", async () => {
    tenantSettings.getAudioSettings.mockResolvedValue({
      enabled: false,
      maxDurationSeconds: 120,
      minConfidence: 0.6,
    });

    const service = buildService();
    await service.processInboundAudio(baseInput);

    expect(prisma.messageEvent.update).toHaveBeenCalledWith({
      where: { id: "event-1" },
      data: {
        contentText: null,
        metadata: {
          senderDisplayName: "Cliente Solar",
          mediaId: "media-1",
          mimeType: "audio/ogg",
          transcriptionStatus: "REJECTED_DISABLED",
        },
      },
    });
    expect(handoffsService.ensureAutomaticHandoffForThread).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      threadId: "thread-1",
      reason: expect.stringContaining("desabilitada"),
      note: null,
    });
    expect(abuseProtectionService.checkAudioSenderRateLimit).not.toHaveBeenCalled();
    expect(adapter.downloadMedia).not.toHaveBeenCalled();
  });

  it("rejects with RATE_LIMITED before touching the provider when the sender exceeded the audio rate limit", async () => {
    abuseProtectionService.checkAudioSenderRateLimit.mockResolvedValue({
      allowed: false,
      limit: 10,
    });

    const service = buildService();
    await service.processInboundAudio(baseInput);

    expect(prisma.messageEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          metadata: expect.objectContaining({
            transcriptionStatus: "REJECTED_RATE_LIMITED",
          }),
        }),
      }),
    );
    expect(planEntitlements.checkAiConversationQuota).not.toHaveBeenCalled();
    expect(adapter.downloadMedia).not.toHaveBeenCalled();
  });

  it("rejects with QUOTA_EXCEEDED and audits PLAN_AI_CONVERSATION_QUOTA_EXCEEDED when the AI-conversation quota is reached", async () => {
    planEntitlements.checkAiConversationQuota.mockResolvedValue({
      allowed: false,
      limit: 200,
      usedThisMonth: 200,
    });

    const service = buildService();
    await service.processInboundAudio(baseInput);

    expect(prisma.messageEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          metadata: expect.objectContaining({
            transcriptionStatus: "REJECTED_QUOTA_EXCEEDED",
          }),
        }),
      }),
    );
    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "PLAN_AI_CONVERSATION_QUOTA_EXCEEDED",
        tenantId: "tenant-1",
        targetId: "thread-1",
      }),
    );
    expect(planEntitlements.checkAudioTranscriptionQuota).not.toHaveBeenCalled();
    expect(adapter.downloadMedia).not.toHaveBeenCalled();
  });

  it("rejects with TRANSCRIPTION_QUOTA_EXCEEDED, checked before any media download, and audits PLAN_AUDIO_TRANSCRIPTION_QUOTA_EXCEEDED", async () => {
    planEntitlements.checkAudioTranscriptionQuota.mockResolvedValue({
      allowed: false,
      limit: 3_000,
      usedSecondsThisMonth: 2_990,
    });

    const service = buildService();
    await service.processInboundAudio(baseInput);

    expect(planEntitlements.checkAudioTranscriptionQuota).toHaveBeenCalledWith(
      "tenant-1",
      120, // audioSettings.maxDurationSeconds — the conservative worst-case increment
    );
    expect(prisma.messageEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          metadata: expect.objectContaining({
            transcriptionStatus: "REJECTED_TRANSCRIPTION_QUOTA_EXCEEDED",
          }),
        }),
      }),
    );
    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "PLAN_AUDIO_TRANSCRIPTION_QUOTA_EXCEEDED",
        tenantId: "tenant-1",
        targetId: "thread-1",
      }),
    );
    // The whole point of adjustment (3) from the approved plan: this guard
    // runs before the adapter is even resolved, so no download/metadata
    // fetch happens once the cost-quota check fails.
    expect(providerFactory.getAdapter).not.toHaveBeenCalled();
    expect(adapter.getMediaMetadata).not.toHaveBeenCalled();
    expect(adapter.downloadMedia).not.toHaveBeenCalled();
  });

  it("rejects with PROVIDER_UNSUPPORTED when the resolved adapter has no downloadMedia implementation", async () => {
    providerFactory.getAdapter.mockReturnValue({});

    const service = buildService();
    await service.processInboundAudio(baseInput);

    expect(prisma.messageEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          metadata: expect.objectContaining({
            transcriptionStatus: "REJECTED_PROVIDER_UNSUPPORTED",
          }),
        }),
      }),
    );
  });

  it("rejects with DURATION_EXCEEDED_ESTIMATED via the pre-download size-proxy guard, without downloading or transcribing", async () => {
    // maxDurationSeconds=120 → estimated max bytes = 120 * 4000 * 1.5 = 720000
    adapter.getMediaMetadata.mockResolvedValue({
      mimeType: "audio/ogg",
      sizeBytes: 900_000,
    });

    const service = buildService();
    await service.processInboundAudio(baseInput);

    expect(prisma.messageEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          metadata: expect.objectContaining({
            transcriptionStatus: "REJECTED_DURATION_EXCEEDED_ESTIMATED",
          }),
        }),
      }),
    );
    expect(adapter.downloadMedia).not.toHaveBeenCalled();
    expect(transcriptionProvider.transcribe).not.toHaveBeenCalled();
  });

  it("proceeds to download when getMediaMetadata fails, degrading gracefully instead of blocking the message", async () => {
    adapter.getMediaMetadata.mockRejectedValue(new Error("metadata endpoint down"));

    const service = buildService();
    await service.processInboundAudio(baseInput);

    expect(adapter.downloadMedia).toHaveBeenCalledWith("media-1", baseInput.connection);
    expect(prisma.messageEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          metadata: expect.objectContaining({
            transcriptionStatus: "COMPLETED",
          }),
        }),
      }),
    );
  });

  it("rejects with DURATION_EXCEEDED after transcription when the real duration exceeds the configured limit, and still records durationSeconds for cost accounting", async () => {
    transcriptionProvider.transcribe.mockResolvedValue({
      text: "transcrição parcial",
      confidence: 0.95,
      durationSeconds: 180,
    });

    const service = buildService();
    await service.processInboundAudio(baseInput);

    expect(prisma.messageEvent.update).toHaveBeenCalledWith({
      where: { id: "event-1" },
      data: {
        contentText: "transcrição parcial",
        metadata: {
          senderDisplayName: "Cliente Solar",
          mediaId: "media-1",
          mimeType: "audio/ogg",
          transcriptionStatus: "REJECTED_DURATION_EXCEEDED",
          durationSeconds: 180,
        },
      },
    });
    expect(handoffsService.ensureAutomaticHandoffForThread).toHaveBeenCalledWith(
      expect.objectContaining({
        note: expect.stringContaining("transcrição parcial"),
      }),
    );
    expect(debounce.schedule).not.toHaveBeenCalled();
  });

  it("rejects with LOW_CONFIDENCE after transcription when confidence is below the configured minimum, and still records durationSeconds for cost accounting", async () => {
    transcriptionProvider.transcribe.mockResolvedValue({
      text: "áudio incompreensível",
      confidence: 0.3,
      durationSeconds: 8,
    });

    const service = buildService();
    await service.processInboundAudio(baseInput);

    expect(prisma.messageEvent.update).toHaveBeenCalledWith({
      where: { id: "event-1" },
      data: {
        contentText: "áudio incompreensível",
        metadata: {
          senderDisplayName: "Cliente Solar",
          mediaId: "media-1",
          mimeType: "audio/ogg",
          transcriptionStatus: "REJECTED_LOW_CONFIDENCE",
          durationSeconds: 8,
        },
      },
    });
    expect(debounce.schedule).not.toHaveBeenCalled();
  });

  it("on success: persists the completed transcription, updates the thread preview, and schedules the debounce with AUDIO modality", async () => {
    const service = buildService();
    await service.processInboundAudio(baseInput);

    expect(prisma.messageEvent.update).toHaveBeenCalledWith({
      where: { id: "event-1" },
      data: {
        contentText: "Olá, quero agendar uma consulta",
        metadata: {
          senderDisplayName: "Cliente Solar",
          mediaId: "media-1",
          mimeType: "audio/ogg",
          transcriptionStatus: "COMPLETED",
          transcriptionProvider: "mock",
          transcriptConfidence: 0.9,
          transcriptionLatencyMs: expect.any(Number),
          durationSeconds: 12,
        },
      },
    });

    expect(prisma.messageThread.update).toHaveBeenCalledWith({
      where: { id: "thread-1" },
      data: { lastMessagePreview: "🎤 Olá, quero agendar uma consulta" },
      select: { status: true, lastMessagePreview: true, lastMessageAt: true },
    });

    expect(debounce.schedule).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      threadId: "thread-1",
      messageText: "Olá, quero agendar uma consulta",
      senderPhoneNumber: "11988887777",
      senderDisplayName: "Cliente Solar",
      patientId: "patient-1",
      correlationId: "event-1",
      inputModality: "AUDIO",
    });

    expect(messagingGateway.emitThreadUpdated).toHaveBeenCalledWith("tenant-1", {
      threadId: "thread-1",
      status: "OPEN",
      lastMessagePreview: "preview",
      lastMessageAt: "2026-03-23T12:00:00.000Z",
    });
    expect(handoffsService.ensureAutomaticHandoffForThread).not.toHaveBeenCalled();
  });

  it("never throws on an unexpected error mid-pipeline — falls back to PROCESSING_ERROR rejection instead", async () => {
    adapter.downloadMedia.mockRejectedValue(new Error("network exploded"));

    const service = buildService();

    await expect(service.processInboundAudio(baseInput)).resolves.toBeUndefined();

    expect(prisma.messageEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          metadata: expect.objectContaining({
            transcriptionStatus: "REJECTED_PROCESSING_ERROR",
          }),
        }),
      }),
    );
  });

  it("never throws even when the fallback rejection itself fails to persist", async () => {
    adapter.downloadMedia.mockRejectedValue(new Error("network exploded"));
    prisma.messageEvent.update.mockRejectedValue(new Error("db unavailable"));

    const service = buildService();

    await expect(service.processInboundAudio(baseInput)).resolves.toBeUndefined();
  });

  it("markStuckAsRejected rejects a PENDING event with STUCK_TIMEOUT via the sweep cron safety net", async () => {
    const service = buildService();

    await service.markStuckAsRejected({
      tenantId: "tenant-1",
      threadId: "thread-1",
      eventId: "event-1",
      mediaId: "media-1",
      mimeType: "audio/ogg",
      senderDisplayName: "Cliente Solar",
    });

    expect(prisma.messageEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          metadata: expect.objectContaining({
            transcriptionStatus: "REJECTED_STUCK_TIMEOUT",
          }),
        }),
      }),
    );
    expect(handoffsService.ensureAutomaticHandoffForThread).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: expect.stringContaining("concluído a tempo"),
      }),
    );
  });
});
