import { Injectable, Logger } from "@nestjs/common";
import type {
  TranscriptionOptions,
  TranscriptionProvider,
  TranscriptionResult,
} from "./transcription-provider.interface";

const MOCK_TRANSCRIPT_TEXT =
  "Olá, gostaria de agendar uma avaliação, vocês têm horário essa semana?";

@Injectable()
export class MockTranscriptionProvider implements TranscriptionProvider {
  private readonly logger = new Logger(MockTranscriptionProvider.name);

  async transcribe(
    audio: Buffer,
    opts: TranscriptionOptions,
  ): Promise<TranscriptionResult> {
    this.logger.debug(
      `Mock transcription for ${audio.length} bytes (${opts.mimeType}, lang=${opts.language}).`,
    );

    return {
      text: MOCK_TRANSCRIPT_TEXT,
      confidence: 0.95,
      durationSeconds: 8,
    };
  }
}
