import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { timingSafeEqual } from "crypto";
import type { Request } from "express";

const HEADER_NAME = "x-cron-token";

/**
 * CronGuard — shared-secret guard for internal cron endpoints.
 *
 * Callers MUST include `X-Cron-Token: <CRON_SECRET>` in the request header.
 * Comparison is timing-safe to prevent timing-attack token leakage.
 *
 * In development, if CRON_SECRET is not set the guard rejects all requests
 * (fail-secure). Set CRON_SECRET in .env for local cron testing.
 */
@Injectable()
export class CronGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const provided = request.headers[HEADER_NAME];

    if (typeof provided !== "string" || !provided.trim()) {
      throw new UnauthorizedException("Cron token is missing.");
    }

    const secret = this.configService.get<string>("app.cronSecret") ?? "";

    if (!secret.trim()) {
      throw new UnauthorizedException("Cron secret is not configured.");
    }

    const expectedBuf = Buffer.from(secret, "utf8");
    const providedBuf = Buffer.from(provided.trim(), "utf8");

    if (expectedBuf.length !== providedBuf.length) {
      throw new UnauthorizedException("Invalid cron token.");
    }

    if (!timingSafeEqual(expectedBuf, providedBuf)) {
      throw new UnauthorizedException("Invalid cron token.");
    }

    return true;
  }
}
