import {
  ConflictException,
  Controller,
  Post,
  UseGuards,
  HttpCode,
  HttpStatus,
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../../database/prisma.service";
import { timingSafeEqual } from "crypto";
import type { Request } from "express";
import { DemoVitalisResetService, ResetResult } from "./demo-vitalis-reset.service";

const DEMO_RESET_HEADER = "x-demo-reset-token";

@Injectable()
class DemoResetGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const provided = request.headers[DEMO_RESET_HEADER];

    if (typeof provided !== "string" || !provided.trim()) {
      throw new UnauthorizedException("Demo reset token is missing.");
    }

    const secret = this.config.get<string>("DEMO_RESET_SECRET", "");

    if (!secret.trim()) {
      throw new UnauthorizedException("DEMO_RESET_SECRET is not configured.");
    }

    const expectedBuf = Buffer.from(secret, "utf8");
    const providedBuf = Buffer.from(provided.trim(), "utf8");

    if (expectedBuf.length !== providedBuf.length || !timingSafeEqual(expectedBuf, providedBuf)) {
      throw new UnauthorizedException("Invalid demo reset token.");
    }

    return true;
  }
}

@Controller("demo")
export class DemoController {
  constructor(
    private readonly resetService: DemoVitalisResetService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Bootstrap endpoint — no auth, but only works once (when the Vitalis tenant
   * does not yet exist). Subsequent calls return 409 Conflict.
   * Use POST /demo/vitalis/reset (with x-demo-reset-token) for resets.
   */
  @Post("vitalis/init")
  @HttpCode(HttpStatus.OK)
  async initVitalis(): Promise<ResetResult> {
    const existing = await this.prisma.tenant.findUnique({
      where: { slug: "vitalis" },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException(
        "Vitalis demo tenant already exists. Use POST /demo/vitalis/reset to refresh demo data.",
      );
    }
    return this.resetService.reset();
  }

  @Post("vitalis/reset")
  @UseGuards(DemoResetGuard)
  @HttpCode(HttpStatus.OK)
  async resetVitalis(): Promise<ResetResult> {
    return this.resetService.reset();
  }
}
