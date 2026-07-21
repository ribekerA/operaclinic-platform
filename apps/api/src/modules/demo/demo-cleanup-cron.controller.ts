import { Controller, HttpCode, HttpStatus, Logger, Post, UseGuards } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import { CronGuard } from "../../auth/guards/cron.guard";
import { PrismaService } from "../../database/prisma.service";
import { DEMO_EMAIL_DOMAIN } from "./demo-multi-tenant.service";

export interface DemoCleanupResult {
  ranAt: string;
  expiredTenants: number;
  orphanedUsersDeleted: number;
}

/**
 * Internal cron controller — NOT protected by JWT.
 * Secured exclusively by CronGuard (X-Cron-Token shared secret).
 *
 * Endpoint: POST /internal/cron/demo-cleanup
 */
@SkipThrottle()
@Controller("internal/cron")
@UseGuards(CronGuard)
export class DemoCleanupCronController {
  private readonly logger = new Logger(DemoCleanupCronController.name);

  constructor(private readonly prisma: PrismaService) {}

  @Post("demo-cleanup")
  @HttpCode(HttpStatus.OK)
  async runDemoCleanup(): Promise<DemoCleanupResult> {
    const ranAt = new Date().toISOString();
    const now = new Date();

    const expired = await this.prisma.demoLeadTenant.findMany({
      where: { expiresAt: { lte: now } },
      select: { tenantId: true, slug: true },
    });

    for (const lead of expired) {
      await this.prisma.tenant.delete({ where: { id: lead.tenantId } });
      this.logger.log(`Deleted expired demo tenant slug=${lead.slug}`);
    }

    const orphanedUsers = await this.prisma.user.deleteMany({
      where: {
        email: { endsWith: `@${DEMO_EMAIL_DOMAIN}` },
        userRoles: { none: {} },
      },
    });

    this.logger.log(
      `Demo cleanup done — expiredTenants=${expired.length} orphanedUsersDeleted=${orphanedUsers.count}`,
    );

    return {
      ranAt,
      expiredTenants: expired.length,
      orphanedUsersDeleted: orphanedUsers.count,
    };
  }
}
