import { HttpException, HttpStatus, Injectable } from "@nestjs/common";
import { createHash } from "crypto";
import type { Request } from "express";

type DemoPublicAction = "create_lead_demo" | "notify_founder";

interface AbuseRule {
  limit: number;
  windowMs: number;
  message: string;
}

interface AbuseCounter {
  count: number;
  resetAt: number;
}

const ABUSE_RULES: Record<DemoPublicAction, AbuseRule> = {
  create_lead_demo: {
    limit: 5,
    windowMs: 15 * 60 * 1000,
    message: "Too many demo creations. Try again in a few minutes.",
  },
  notify_founder: {
    limit: 20,
    windowMs: 15 * 60 * 1000,
    message: "Too many notifications. Try again in a few minutes.",
  },
};

@Injectable()
export class DemoAbuseProtectionService {
  private readonly counters = new Map<string, AbuseCounter>();

  assertWithinLimit(request: Request, action: DemoPublicAction): void {
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
