import { HttpException, HttpStatus, Injectable } from "@nestjs/common";
import { createHash } from "crypto";
import type { Request } from "express";

type CommercialPublicAction =
  | "get_onboarding"
  | "start_onboarding"
  | "complete_onboarding"
  | "create_checkout"
  | "confirm_checkout"
  | "finalize_onboarding"
  | "escalate_onboarding";

interface AbuseRule {
  limit: number;
  windowMs: number;
  message: string;
}

interface AbuseCounter {
  count: number;
  resetAt: number;
}

const ABUSE_RULES: Record<CommercialPublicAction, AbuseRule> = {
  get_onboarding: {
    limit: 60,
    windowMs: 15 * 60 * 1000,
    message: "Too many onboarding lookups. Try again in a few minutes.",
  },
  start_onboarding: {
    limit: 8,
    windowMs: 15 * 60 * 1000,
    message: "Too many onboarding starts. Try again in a few minutes.",
  },
  complete_onboarding: {
    limit: 12,
    windowMs: 15 * 60 * 1000,
    message: "Too many onboarding updates. Try again in a few minutes.",
  },
  create_checkout: {
    limit: 6,
    windowMs: 15 * 60 * 1000,
    message: "Too many checkout creations. Try again in a few minutes.",
  },
  confirm_checkout: {
    limit: 6,
    windowMs: 15 * 60 * 1000,
    message: "Too many checkout confirmations. Try again in a few minutes.",
  },
  finalize_onboarding: {
    limit: 6,
    windowMs: 15 * 60 * 1000,
    message: "Too many onboarding finalizations. Try again in a few minutes.",
  },
  escalate_onboarding: {
    limit: 10,
    windowMs: 60 * 60 * 1000,
    message: "Too many escalation requests. Try again later or contact support directly.",
  },
};

@Injectable()
export class CommercialAbuseProtectionService {
  private readonly counters = new Map<string, AbuseCounter>();

  assertWithinLimit(request: Request, action: CommercialPublicAction): void {
    this.cleanupExpiredCounters();

    const rule = ABUSE_RULES[action];
    const key = `${action}:${this.buildClientFingerprint(request)}`;
    const now = Date.now();
    const current = this.counters.get(key);

    if (!current || current.resetAt <= now) {
      this.counters.set(key, {
        count: 1,
        resetAt: now + rule.windowMs,
      });
      return;
    }

    if (current.count >= rule.limit) {
      throw new HttpException(rule.message, HttpStatus.TOO_MANY_REQUESTS);
    }

    this.counters.set(key, {
      count: current.count + 1,
      resetAt: current.resetAt,
    });
  }

  private cleanupExpiredCounters(): void {
    const now = Date.now();

    for (const [key, value] of this.counters.entries()) {
      if (value.resetAt <= now) {
        this.counters.delete(key);
      }
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
