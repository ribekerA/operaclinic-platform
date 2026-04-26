import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { RoleCode } from "@prisma/client";
import type { AuthenticatedUser } from "../../auth/interfaces/authenticated-user.interface";
import { TenantsService } from "./tenants.service";

@Injectable()
export class BillingDunningScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BillingDunningScheduler.name);
  private timer: NodeJS.Timeout | null = null;
  private lastRunDayKey: string | null = null;

  constructor(
    private readonly tenantsService: TenantsService,
    private readonly configService: ConfigService,
  ) {}

  onModuleInit(): void {
    if (!this.isEnabled()) {
      this.logger.log("Billing dunning scheduler is disabled.");
      return;
    }

    // Check every 5 minutes and run once per UTC day when threshold hour is reached.
    this.timer = setInterval(() => {
      void this.tick();
    }, 5 * 60 * 1000);

    void this.tick();
    this.logger.log("Billing dunning scheduler started.");
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async tick(): Promise<void> {
    const now = new Date();
    const runHourUtc = this.resolveRunHourUtc();

    if (now.getUTCHours() < runHourUtc) {
      return;
    }

    const dayKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-${String(now.getUTCDate()).padStart(2, "0")}`;

    if (this.lastRunDayKey === dayKey) {
      return;
    }

    try {
      const actor = this.buildSystemActor();
      const result = await this.tenantsService.runBillingDunning(actor);
      this.lastRunDayKey = dayKey;

      this.logger.log(
        `Billing dunning executed processed=${result.processed} reminded=${result.reminded} suspended=${result.suspended}`,
      );
    } catch (error) {
      this.logger.error(
        "Billing dunning scheduler failed",
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  private isEnabled(): boolean {
    const raw = (process.env.BILLING_DUNNING_SCHEDULER_ENABLED ?? "true")
      .trim()
      .toLowerCase();

    if (["false", "0", "off", "no"].includes(raw)) {
      return false;
    }

    // Keep enabled by default because billing dunning is operationally critical.
    return true;
  }

  private resolveRunHourUtc(): number {
    const configured = Number.parseInt(
      process.env.BILLING_DUNNING_SCHEDULER_HOUR_UTC ?? "9",
      10,
    );

    if (Number.isNaN(configured) || configured < 0 || configured > 23) {
      return 9;
    }

    return configured;
  }

  private buildSystemActor(): AuthenticatedUser {
    return {
      id: "system-billing-dunning",
      email: "system@operaclinic.local",
      fullName: "Billing Dunning Scheduler",
      profile: "platform",
      roles: [RoleCode.SUPER_ADMIN],
      tenantIds: [],
      activeTenantId: null,
    };
  }
}
