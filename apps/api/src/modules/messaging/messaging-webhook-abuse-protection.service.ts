import { HttpException, HttpStatus, Injectable, Logger } from "@nestjs/common";
import { createHash } from "crypto";
import type { Request } from "express";
import { PrismaService } from "../../database/prisma.service";

type MessagingPublicAction =
  | "verify_whatsapp_webhook"
  | "receive_whatsapp_webhook";

interface AbuseRule {
  limit: number;
  windowMs: number;
  message: string;
}

const ABUSE_RULES: Record<MessagingPublicAction, AbuseRule> = {
  verify_whatsapp_webhook: {
    limit: 60,
    windowMs: 15 * 60 * 1000,
    message: "Too many WhatsApp verification requests. Try again later.",
  },
  receive_whatsapp_webhook: {
    limit: 240,
    windowMs: 15 * 60 * 1000,
    message: "Too many WhatsApp webhook requests. Try again later.",
  },
};

/**
 * Separate from ABUSE_RULES: those are keyed by IP+User-Agent fingerprint,
 * which can't isolate abuse from a single WhatsApp sender — every inbound
 * webhook call is relayed through Meta's infrastructure, so all senders on a
 * tenant share the same fingerprint. This rule is keyed by tenant+sender
 * phone number instead, to catch one number spamming voice notes to run up
 * transcription/LLM costs.
 */
const AUDIO_SENDER_RATE_LIMIT = {
  limit: 10,
  windowMs: 15 * 60 * 1000,
};

@Injectable()
export class MessagingWebhookAbuseProtectionService {
  private readonly logger = new Logger(MessagingWebhookAbuseProtectionService.name);

  constructor(private readonly prisma: PrismaService) {}

  async assertWithinLimit(request: Request, action: MessagingPublicAction): Promise<void> {
    const rule = ABUSE_RULES[action];
    const key = `${action}:${this.buildClientFingerprint(request)}`;

    try {
      const count = await this.incrementAndGetCount(key, rule.windowMs);

      if (count > rule.limit) {
        throw new HttpException(rule.message, HttpStatus.TOO_MANY_REQUESTS);
      }
    } catch (err) {
      if (err instanceof HttpException) throw err;
      // On DB error, degrade gracefully: allow the request through and log.
      this.logger.warn(`Abuse protection DB error for key ${key}: ${(err as Error).message}`);
    }
  }

  /**
   * Per-sender audio rate limit, checked from AudioTranscriptionService's
   * guard chain rather than at the HTTP layer — the webhook has already
   * responded by the time transcription runs (fire-and-forget), so this
   * returns a result instead of throwing.
   */
  async checkAudioSenderRateLimit(
    tenantId: string,
    senderPhoneNumber: string,
  ): Promise<{ allowed: boolean; limit: number }> {
    const key = `receive_whatsapp_audio:${tenantId}:${senderPhoneNumber}`;

    try {
      const count = await this.incrementAndGetCount(key, AUDIO_SENDER_RATE_LIMIT.windowMs);

      return { allowed: count <= AUDIO_SENDER_RATE_LIMIT.limit, limit: AUDIO_SENDER_RATE_LIMIT.limit };
    } catch (err) {
      // On DB error, degrade gracefully: allow the message through and log.
      this.logger.warn(`Audio rate limit DB error for key ${key}: ${(err as Error).message}`);
      return { allowed: true, limit: AUDIO_SENDER_RATE_LIMIT.limit };
    }
  }

  /**
   * Atomic upsert: if the key exists and window is still active → increment.
   * If the key exists but window has expired → reset to 1 with new resetAt.
   * Uses raw SQL for conditional update atomicity.
   */
  private async incrementAndGetCount(key: string, windowMs: number): Promise<number> {
    const now = new Date();
    const resetAt = new Date(now.getTime() + windowMs);

    const result = await this.prisma.$queryRaw<Array<{ count: number }>>`
      INSERT INTO webhook_rate_limits (id, fingerprint, count, reset_at)
      VALUES (gen_random_uuid(), ${key}, 1, ${resetAt})
      ON CONFLICT (fingerprint) DO UPDATE
        SET count   = CASE
                        WHEN webhook_rate_limits.reset_at <= NOW() THEN 1
                        ELSE webhook_rate_limits.count + 1
                      END,
            reset_at = CASE
                         WHEN webhook_rate_limits.reset_at <= NOW() THEN EXCLUDED.reset_at
                         ELSE webhook_rate_limits.reset_at
                       END
      RETURNING count
    `;

    return result[0]?.count ?? 1;
  }

  private buildClientFingerprint(request: Request): string {
    const forwardedFor = request.headers["x-forwarded-for"];
    const resolvedForwardedFor =
      typeof forwardedFor === "string"
        ? forwardedFor.split(",")[0]?.trim()
        : Array.isArray(forwardedFor)
          ? forwardedFor[0]?.trim()
          : "";
    const realIp =
      typeof request.headers["x-real-ip"] === "string"
        ? request.headers["x-real-ip"].trim()
        : "";
    const userAgent =
      typeof request.headers["user-agent"] === "string"
        ? request.headers["user-agent"].trim().slice(0, 160)
        : "";
    const ip =
      resolvedForwardedFor ||
      realIp ||
      request.ip ||
      request.socket.remoteAddress ||
      "unknown";

    return createHash("sha256")
      .update(`${ip}|${userAgent}`)
      .digest("hex");
  }
}
