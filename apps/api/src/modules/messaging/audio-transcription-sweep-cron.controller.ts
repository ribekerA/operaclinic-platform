import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  UseGuards,
} from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import { MessageEventType } from "@prisma/client";
import { IsBoolean, IsInt, IsOptional, Max, Min } from "class-validator";
import { CronGuard } from "../../auth/guards/cron.guard";
import { PrismaService } from "../../database/prisma.service";
import { AudioTranscriptionService } from "./audio-transcription.service";

const DEFAULT_STALE_THRESHOLD_MINUTES = 10;
const DEFAULT_LOOKBACK_HOURS = 24;
const DEFAULT_LIMIT = 200;

class CronAudioTranscriptionSweepDto {
  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(120)
  staleThresholdMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(168)
  lookbackHours?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  limit?: number;
}

export interface CronAudioTranscriptionSweepResult {
  ranAt: string;
  dryRun: boolean;
  staleThresholdMinutes: number;
  lookbackHours: number;
  totalStuckFound: number;
  processed: number;
  failed: number;
  results: Array<{
    eventId: string;
    tenantId: string;
    threadId: string;
    status: "rejected" | "failed" | "dry_run";
    error?: string;
  }>;
}

/**
 * Internal cron controller — NOT protected by JWT.
 * Secured exclusively by CronGuard (X-Cron-Token shared secret).
 *
 * Endpoint: POST /internal/cron/audio-transcription-sweep
 *
 * Safety net for MessageEvent rows stuck in transcriptionStatus=PENDING —
 * this only catches cases where AudioTranscriptionService.processInboundAudio
 * never reached one of its own terminal states (e.g. a process restart
 * mid-transcription killed the fire-and-forget promise). Under normal
 * operation this sweep should find nothing to process.
 *
 * Bounded by a lookback window (not just a staleness floor) so the query
 * stays a bounded range scan on the existing occurredAt index instead of
 * re-scanning the entire message_events history on every run.
 */
@SkipThrottle()
@Controller("internal/cron")
@UseGuards(CronGuard)
export class AudioTranscriptionSweepCronController {
  private readonly logger = new Logger(AudioTranscriptionSweepCronController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audioTranscriptionService: AudioTranscriptionService,
  ) {}

  @Post("audio-transcription-sweep")
  @HttpCode(HttpStatus.OK)
  async runAudioTranscriptionSweep(
    @Body() input: CronAudioTranscriptionSweepDto,
  ): Promise<CronAudioTranscriptionSweepResult> {
    const ranAt = new Date().toISOString();
    const dryRun = input.dryRun ?? false;
    const staleThresholdMinutes =
      input.staleThresholdMinutes ?? DEFAULT_STALE_THRESHOLD_MINUTES;
    const lookbackHours = input.lookbackHours ?? DEFAULT_LOOKBACK_HOURS;
    const limit = input.limit ?? DEFAULT_LIMIT;

    const now = Date.now();
    const staleThreshold = new Date(now - staleThresholdMinutes * 60_000);
    const lookbackFloor = new Date(now - lookbackHours * 3_600_000);

    const stuckEvents = await this.prisma.messageEvent.findMany({
      where: {
        eventType: MessageEventType.AUDIO,
        occurredAt: { gte: lookbackFloor, lte: staleThreshold },
        metadata: { path: ["transcriptionStatus"], equals: "PENDING" },
      },
      select: { id: true, tenantId: true, threadId: true, metadata: true },
      orderBy: { occurredAt: "asc" },
      take: limit,
    });

    this.logger.log(
      `Cron audio-transcription-sweep started — found ${stuckEvents.length} stuck event(s) dryRun=${dryRun}`,
    );

    const results: CronAudioTranscriptionSweepResult["results"] = [];
    let processed = 0;
    let failed = 0;

    for (const event of stuckEvents) {
      const metadata = (event.metadata ?? {}) as Record<string, unknown>;
      const mediaId = typeof metadata.mediaId === "string" ? metadata.mediaId : null;
      const mimeType = typeof metadata.mimeType === "string" ? metadata.mimeType : null;
      const senderDisplayName =
        typeof metadata.senderDisplayName === "string" ? metadata.senderDisplayName : null;

      if (dryRun) {
        results.push({
          eventId: event.id,
          tenantId: event.tenantId,
          threadId: event.threadId,
          status: "dry_run",
        });
        continue;
      }

      try {
        await this.audioTranscriptionService.markStuckAsRejected({
          tenantId: event.tenantId,
          threadId: event.threadId,
          eventId: event.id,
          mediaId,
          mimeType,
          senderDisplayName,
        });

        results.push({
          eventId: event.id,
          tenantId: event.tenantId,
          threadId: event.threadId,
          status: "rejected",
        });
        processed++;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.error(`Event ${event.id}: sweep rejection failed — ${message}`);
        results.push({
          eventId: event.id,
          tenantId: event.tenantId,
          threadId: event.threadId,
          status: "failed",
          error: message,
        });
        failed++;
      }
    }

    this.logger.log(
      `Cron audio-transcription-sweep done — processed=${processed} failed=${failed} dryRun=${dryRun}`,
    );

    return {
      ranAt,
      dryRun,
      staleThresholdMinutes,
      lookbackHours,
      totalStuckFound: stuckEvents.length,
      processed,
      failed,
      results,
    };
  }
}
