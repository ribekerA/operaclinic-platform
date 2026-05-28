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

@Injectable()
export class MessagingWebhookAbuseProtectionService {
  private readonly logger = new Logger(MessagingWebhookAbuseProtectionService.name);

  constructor(private readonly prisma: PrismaService) {}

  async assertWithinLimit(request: Request, action: MessagingPublicAction): Promise<void> {
    const rule = ABUSE_RULES[action];
    const key = `${action}:${this.buildClientFingerprint(request)}`;
    const now = new Date();
    const resetAt = new Date(now.getTime() + rule.windowMs);

    try {
      // Atomic upsert: if fingerprint exists and window is still active → increment.
      // If fingerprint exists but window has expired → reset to 1 with new resetAt.
      // Uses raw SQL for conditional update atomicity.
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

      const count = result[0]?.count ?? 1;

      if (count > rule.limit) {
        throw new HttpException(rule.message, HttpStatus.TOO_MANY_REQUESTS);
      }
    } catch (err) {
      if (err instanceof HttpException) throw err;
      // On DB error, degrade gracefully: allow the request through and log.
      this.logger.warn(`Abuse protection DB error for key ${key}: ${(err as Error).message}`);
    }
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
