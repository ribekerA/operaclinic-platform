import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { TranscriptionProvider } from "./transcription-provider.interface";
import { MockTranscriptionProvider } from "./mock-transcription.provider";

type TranscriptionProviderName = "mock" | "whisper" | "deepgram";

/**
 * Factory que resolve o TranscriptionProvider configurado via env
 * (TRANSCRIPTION_PROVIDER). Diferente do PaymentAdapterFactory, não falha o
 * boot da API se estiver desconfigurado em produção: áudio é feature opcional
 * e gateada por tenant (audio.enabled em TenantSettingsService) — a ausência
 * de provider só deve importar quando a transcrição for de fato invocada.
 */
@Injectable()
export class TranscriptionProviderFactory {
  private readonly logger = new Logger(TranscriptionProviderFactory.name);
  private provider: TranscriptionProvider | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly mockProvider: MockTranscriptionProvider,
  ) {}

  getProvider(): TranscriptionProvider {
    if (this.provider) {
      return this.provider;
    }

    const providerName = this.resolveProviderName();

    if (providerName === "whisper" || providerName === "deepgram") {
      throw new Error(
        `TRANSCRIPTION_PROVIDER=${providerName} ainda não tem implementação real — use "mock" ou implemente o adapter antes de habilitar.`,
      );
    }

    this.logger.warn("Using Mock transcription provider (development/pilot only)");
    this.provider = this.mockProvider;

    return this.provider;
  }

  private resolveProviderName(): TranscriptionProviderName {
    const configured = this.configService.get<string>(
      "transcription.provider",
      "",
    );
    const normalized = configured.trim().toLowerCase();

    if (
      normalized === "mock" ||
      normalized === "whisper" ||
      normalized === "deepgram"
    ) {
      return normalized;
    }

    return "mock";
  }

  /**
   * Nome do provider ativo (para metadata de auditoria/observabilidade).
   */
  getProviderName(): TranscriptionProviderName {
    return this.resolveProviderName();
  }

  /**
   * Reset provider (útil para testes)
   */
  resetProvider(): void {
    this.provider = null;
  }
}
