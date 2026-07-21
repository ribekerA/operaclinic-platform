import { Injectable, Logger } from "@nestjs/common";
import { InputModality, MessageThreadStatus } from "@prisma/client";
import { PrismaService } from "../../database/prisma.service";
import { AUDIT_ACTIONS } from "../../common/audit/audit.constants";
import { AuditService } from "../../common/audit/audit.service";
import { PlanEntitlementsService } from "../../common/plan-entitlements/plan-entitlements.service";
import { TenantSettingsService } from "../platform/tenant-settings.service";
import { MessagingProviderFactory } from "./adapters/messaging-provider.factory";
import { MessagingWebhookAbuseProtectionService } from "./messaging-webhook-abuse-protection.service";
import type {
  MediaMetadata,
  MessagingProviderAdapter,
  ProviderConnectionContext,
} from "./adapters/messaging-provider.adapter";
import { HandoffRequestsService } from "./handoff-requests.service";
import { MessagingGateway } from "./gateways/messaging.gateway";
import { MessageDebounceService } from "./message-debounce.service";
import { TranscriptionProviderFactory } from "./transcription/transcription-provider.factory";
import type { TranscriptionResult } from "./transcription/transcription-provider.interface";

export interface ProcessInboundAudioInput {
  tenantId: string;
  threadId: string;
  eventId: string;
  mediaId: string;
  mimeType: string | null;
  senderPhoneNumber: string;
  senderDisplayName: string | null;
  patientId: string | null;
  connection: ProviderConnectionContext;
}

/**
 * Subset of ProcessInboundAudioInput needed to reject/close a stuck
 * MessageEvent — used both by the primary guard-failure path and by the
 * safety-net sweep cron, which never has a live provider connection.
 */
export interface RejectAudioInput {
  tenantId: string;
  threadId: string;
  eventId: string;
  mediaId: string | null;
  mimeType: string | null;
  senderDisplayName: string | null;
}

const PENDING_HUMAN_ATTENTION_PREVIEW = "🎤 Mensagem de voz — necessita atenção humana";

// Heurística leniente usada só como filtro pré-download: assume um bitrate alto
// (32kbps) para notas de voz OGG/Opus do WhatsApp, o que subestima a duração real
// (bitrate típico costuma ser menor) — de propósito, para nunca rejeitar uma
// mensagem legítima antes da checagem real de duração pós-transcrição. Só existe
// para barrar arquivos muito acima do limite antes de gastar banda/tempo com o
// download completo.
const ASSUMED_BYTES_PER_SECOND = 4_000;
const SIZE_PROXY_SAFETY_MARGIN = 1.5;

const TRANSCRIPTION_LANGUAGE = "pt-BR";

@Injectable()
export class AudioTranscriptionService {
  private readonly logger = new Logger(AudioTranscriptionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly providerFactory: MessagingProviderFactory,
    private readonly tenantSettings: TenantSettingsService,
    private readonly planEntitlements: PlanEntitlementsService,
    private readonly abuseProtectionService: MessagingWebhookAbuseProtectionService,
    private readonly transcriptionFactory: TranscriptionProviderFactory,
    private readonly debounce: MessageDebounceService,
    private readonly handoffsService: HandoffRequestsService,
    private readonly auditService: AuditService,
    private readonly messagingGateway: MessagingGateway,
  ) {}

  /**
   * Pipeline de transcrição de áudio inbound. Chamado em fire-and-forget
   * verdadeiro (sem await) pelo webhook, então NUNCA deve propagar exceções —
   * todo caminho de falha termina em handoff, não em erro não tratado.
   */
  async processInboundAudio(input: ProcessInboundAudioInput): Promise<void> {
    try {
      const audioSettings = await this.tenantSettings.getAudioSettings(input.tenantId);

      if (!audioSettings.enabled) {
        await this.rejectAudio(
          input,
          "DISABLED",
          "a transcrição de áudio está desabilitada para esta clínica.",
        );
        return;
      }

      const rateLimit = await this.abuseProtectionService.checkAudioSenderRateLimit(
        input.tenantId,
        input.senderPhoneNumber,
      );

      if (!rateLimit.allowed) {
        await this.rejectAudio(
          input,
          "RATE_LIMITED",
          `este número enviou mais de ${rateLimit.limit} mensagens de voz em um curto período — aguarde alguns minutos ou continue por texto.`,
        );
        return;
      }

      const quota = await this.planEntitlements.checkAiConversationQuota(
        input.tenantId,
        input.threadId,
      );

      if (!quota.allowed) {
        await this.rejectAudio(
          input,
          "QUOTA_EXCEEDED",
          "o limite mensal de conversas atendidas por IA do plano contratado foi atingido.",
        );

        await this.auditService.record({
          action: AUDIT_ACTIONS.PLAN_AI_CONVERSATION_QUOTA_EXCEEDED,
          actor: this.buildSystemActor(input.tenantId),
          tenantId: input.tenantId,
          targetType: "message_thread",
          targetId: input.threadId,
          metadata: {
            limit: quota.limit,
            usedThisMonth: quota.usedThisMonth,
            source: "audio_transcription",
          },
        });
        return;
      }

      const transcriptionQuota = await this.planEntitlements.checkAudioTranscriptionQuota(
        input.tenantId,
        audioSettings.maxDurationSeconds,
      );

      if (!transcriptionQuota.allowed) {
        await this.rejectAudio(
          input,
          "TRANSCRIPTION_QUOTA_EXCEEDED",
          "o limite mensal de minutos de transcrição de áudio do plano contratado foi atingido.",
        );

        await this.auditService.record({
          action: AUDIT_ACTIONS.PLAN_AUDIO_TRANSCRIPTION_QUOTA_EXCEEDED,
          actor: this.buildSystemActor(input.tenantId),
          tenantId: input.tenantId,
          targetType: "message_thread",
          targetId: input.threadId,
          metadata: {
            limit: transcriptionQuota.limit,
            usedSecondsThisMonth: transcriptionQuota.usedSecondsThisMonth,
            source: "audio_transcription",
          },
        });
        return;
      }

      const adapter = this.providerFactory.getAdapter(input.connection.provider);

      if (!adapter.downloadMedia) {
        this.logger.warn(
          `Provider ${input.connection.provider} does not implement downloadMedia — skipping audio transcription for event ${input.eventId}.`,
        );
        await this.rejectAudio(
          input,
          "PROVIDER_UNSUPPORTED",
          "este canal não suporta download de mídia.",
        );
        return;
      }

      const exceedsEstimated = await this.exceedsEstimatedDuration(
        adapter,
        input,
        audioSettings.maxDurationSeconds,
      );

      if (exceedsEstimated) {
        await this.rejectAudio(
          input,
          "DURATION_EXCEEDED_ESTIMATED",
          `o arquivo de áudio excede o tamanho esperado para o limite de ${audioSettings.maxDurationSeconds}s configurado.`,
        );
        return;
      }

      const media = await adapter.downloadMedia(input.mediaId, input.connection);

      const transcriptionProvider = this.transcriptionFactory.getProvider();
      const transcriptionStartedAt = Date.now();
      const result = await transcriptionProvider.transcribe(media.buffer, {
        language: TRANSCRIPTION_LANGUAGE,
        mimeType: input.mimeType ?? media.mimeType,
      });
      const transcriptionLatencyMs = Date.now() - transcriptionStartedAt;

      if (result.durationSeconds > audioSettings.maxDurationSeconds) {
        await this.rejectAudio(
          input,
          "DURATION_EXCEEDED",
          `o áudio de ${result.durationSeconds}s excede o limite de ${audioSettings.maxDurationSeconds}s configurado.`,
          result.text,
          result.durationSeconds,
        );
        return;
      }

      if (result.confidence < audioSettings.minConfidence) {
        await this.rejectAudio(
          input,
          "LOW_CONFIDENCE",
          `a confiança da transcrição (${result.confidence.toFixed(2)}) ficou abaixo do mínimo configurado (${audioSettings.minConfidence}).`,
          result.text,
          result.durationSeconds,
        );
        return;
      }

      await this.finalizeSuccess(input, result, transcriptionLatencyMs);
    } catch (error) {
      this.logger.error(
        `Audio transcription pipeline failed for event ${input.eventId} (thread ${input.threadId}): ${
          error instanceof Error ? error.message : "unknown error"
        }`,
      );

      try {
        await this.rejectAudio(
          input,
          "PROCESSING_ERROR",
          "houve uma falha ao processar o áudio recebido.",
        );
      } catch (rejectError) {
        this.logger.error(
          `Failed to record audio rejection for event ${input.eventId}: ${
            rejectError instanceof Error ? rejectError.message : "unknown error"
          }`,
        );
      }
    }
  }

  private async exceedsEstimatedDuration(
    adapter: MessagingProviderAdapter,
    input: ProcessInboundAudioInput,
    maxDurationSeconds: number,
  ): Promise<boolean> {
    if (!adapter.getMediaMetadata) {
      return false;
    }

    try {
      const metadata: MediaMetadata = await adapter.getMediaMetadata(
        input.mediaId,
        input.connection,
      );

      if (metadata.sizeBytes === null) {
        return false;
      }

      const estimatedMaxBytes =
        maxDurationSeconds * ASSUMED_BYTES_PER_SECOND * SIZE_PROXY_SAFETY_MARGIN;

      return metadata.sizeBytes > estimatedMaxBytes;
    } catch (error) {
      this.logger.warn(
        `Failed to fetch media metadata for size proxy check (media ${input.mediaId}): ${
          error instanceof Error ? error.message : "unknown error"
        } — proceeding to download.`,
      );
      return false;
    }
  }

  private async finalizeSuccess(
    input: ProcessInboundAudioInput,
    result: TranscriptionResult,
    transcriptionLatencyMs: number,
  ): Promise<void> {
    const providerName = this.transcriptionFactory.getProviderName();
    const preview = this.truncatePreview(`🎤 ${result.text}`);

    await this.prisma.messageEvent.update({
      where: { id: input.eventId },
      data: {
        contentText: result.text,
        metadata: {
          senderDisplayName: input.senderDisplayName,
          mediaId: input.mediaId,
          mimeType: input.mimeType,
          transcriptionStatus: "COMPLETED",
          transcriptionProvider: providerName,
          transcriptConfidence: result.confidence,
          transcriptionLatencyMs,
          durationSeconds: result.durationSeconds,
        },
      },
    });

    const thread = await this.prisma.messageThread.update({
      where: { id: input.threadId },
      data: { lastMessagePreview: preview },
      select: { status: true, lastMessagePreview: true, lastMessageAt: true },
    });

    this.debounce.schedule({
      tenantId: input.tenantId,
      threadId: input.threadId,
      messageText: result.text,
      senderPhoneNumber: input.senderPhoneNumber,
      senderDisplayName: input.senderDisplayName,
      patientId: input.patientId,
      correlationId: input.eventId,
      inputModality: InputModality.AUDIO,
    });

    this.emitThreadActivity(input);
    this.messagingGateway.emitThreadUpdated(input.tenantId, {
      threadId: input.threadId,
      status: thread.status,
      lastMessagePreview: thread.lastMessagePreview,
      lastMessageAt: thread.lastMessageAt?.toISOString() ?? null,
    });
  }

  /**
   * Fallback safety net for MessageEvent rows stuck in transcriptionStatus
   * PENDING — called by the sweep cron when the fire-and-forget pipeline
   * never resolved (e.g. process restart mid-transcription). Not part of
   * the primary path.
   */
  async markStuckAsRejected(input: RejectAudioInput): Promise<void> {
    this.logger.warn(
      `Audio transcription stuck for event ${input.eventId} (thread ${input.threadId}) — marking as rejected via sweep.`,
    );

    await this.rejectAudio(
      input,
      "STUCK_TIMEOUT",
      "o processamento do áudio não foi concluído a tempo.",
    );
  }

  private async rejectAudio(
    input: RejectAudioInput,
    reasonCode: string,
    humanReason: string,
    partialTranscript?: string,
    durationSeconds?: number,
  ): Promise<void> {
    await this.prisma.messageEvent.update({
      where: { id: input.eventId },
      data: {
        contentText: partialTranscript ?? null,
        metadata: {
          senderDisplayName: input.senderDisplayName,
          mediaId: input.mediaId,
          mimeType: input.mimeType,
          transcriptionStatus: `REJECTED_${reasonCode}`,
          // Só presente quando a transcrição de fato rodou (DURATION_EXCEEDED/LOW_CONFIDENCE) —
          // é o que getTranscriptionSecondsUsedThisMonth soma para refletir custo real do provider,
          // mesmo em mensagens rejeitadas depois de transcritas.
          ...(durationSeconds !== undefined ? { durationSeconds } : {}),
        },
      },
    });

    await this.handoffsService.ensureAutomaticHandoffForThread({
      tenantId: input.tenantId,
      threadId: input.threadId,
      reason: `Mensagem de voz recebida — ${humanReason}`,
      note: partialTranscript ? `Transcrição parcial: "${partialTranscript}"` : null,
    });

    const thread = await this.prisma.messageThread.update({
      where: { id: input.threadId },
      data: { lastMessagePreview: PENDING_HUMAN_ATTENTION_PREVIEW },
      select: { lastMessagePreview: true, lastMessageAt: true },
    });

    this.emitThreadActivity(input);
    this.messagingGateway.emitThreadUpdated(input.tenantId, {
      threadId: input.threadId,
      status: MessageThreadStatus.IN_HANDOFF,
      lastMessagePreview: thread.lastMessagePreview,
      lastMessageAt: thread.lastMessageAt?.toISOString() ?? null,
    });
  }

  private emitThreadActivity(input: { tenantId: string; threadId: string }): void {
    this.messagingGateway.emitThreadActivity(input.tenantId, {
      threadId: input.threadId,
      direction: "INBOUND",
      eventType: "AUDIO",
      occurredAt: new Date().toISOString(),
    });
  }

  private truncatePreview(text: string): string {
    const normalized = text.trim();

    return normalized.length <= 255 ? normalized : `${normalized.slice(0, 252)}...`;
  }

  private buildSystemActor(tenantId: string) {
    return {
      id: `system:audio-transcription:${tenantId}`,
      email: "agent-system@operaclinic.internal",
      profile: "clinic" as const,
      roles: ["RECEPTION" as const],
      tenantIds: [tenantId],
      activeTenantId: tenantId,
    };
  }
}
