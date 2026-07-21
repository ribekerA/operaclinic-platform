export interface TranscriptionResult {
  text: string;
  confidence: number;
  durationSeconds: number;
}

export interface TranscriptionOptions {
  language: string;
  mimeType: string;
}

export interface TranscriptionProvider {
  transcribe(
    audio: Buffer,
    opts: TranscriptionOptions,
  ): Promise<TranscriptionResult>;
}
