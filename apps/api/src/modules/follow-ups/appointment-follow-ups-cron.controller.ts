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
import { MessagingChannel, RoleCode, UserStatus } from "@prisma/client";
import { IsBoolean, IsInt, IsOptional, IsString, Max, Min } from "class-validator";
import { CronGuard } from "../../auth/guards/cron.guard";
import { AuthenticatedUser } from "../../auth/interfaces/authenticated-user.interface";
import { PrismaService } from "../../database/prisma.service";
import {
  AppointmentFollowUpRunResult,
  AppointmentFollowUpsService,
} from "./appointment-follow-ups.service";

const DEFAULT_TEMPLATE_CODE = "APPOINTMENT_REMINDER_24H";

class CronAppointmentRemindersDto {
  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;

  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(180)
  windowMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limitPerTenant?: number;

  @IsOptional()
  @IsString()
  templateCode?: string;
}

export interface CronAppointmentRemindersResult {
  ranAt: string;
  dryRun: boolean;
  totalTenants: number;
  processedTenants: number;
  skippedTenants: number;
  results: Array<{
    tenantId: string;
    status: "processed" | "skipped";
    skipReason?: string;
    summary?: AppointmentFollowUpRunResult["summary"];
  }>;
}

/**
 * Internal cron controller — NOT protected by JWT.
 * Secured exclusively by CronGuard (X-Cron-Token shared secret).
 *
 * Endpoint: POST /internal/cron/appointment-reminders
 *
 * Iterates all active tenants, finds each tenant's APPOINTMENT_REMINDER_24H
 * template (or the code provided in body), and dispatches reminders.
 */
@SkipThrottle()
@Controller("internal/cron")
@UseGuards(CronGuard)
export class AppointmentFollowUpsCronController {
  private readonly logger = new Logger(AppointmentFollowUpsCronController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly appointmentFollowUpsService: AppointmentFollowUpsService,
  ) {}

  @Post("appointment-reminders")
  @HttpCode(HttpStatus.OK)
  async runAppointmentReminders(
    @Body() input: CronAppointmentRemindersDto,
  ): Promise<CronAppointmentRemindersResult> {
    const ranAt = new Date().toISOString();
    const dryRun = input.dryRun ?? false;
    const templateCode = input.templateCode ?? DEFAULT_TEMPLATE_CODE;
    const limitPerTenant = input.limitPerTenant ?? 100;

    this.logger.log(`Cron appointment-reminders started — dryRun=${dryRun} templateCode=${templateCode}`);

    const tenants = await this.prisma.tenant.findMany({
      where: { status: "ACTIVE" },
      select: { id: true },
      orderBy: { createdAt: "asc" },
    });

    const results: CronAppointmentRemindersResult["results"] = [];
    let processedTenants = 0;
    let skippedTenants = 0;

    for (const tenant of tenants) {
      const template = await this.prisma.messageTemplate.findFirst({
        where: {
          tenantId: tenant.id,
          channel: MessagingChannel.WHATSAPP,
          code: templateCode,
          isActive: true,
        },
        select: { id: true },
      });

      if (!template) {
        this.logger.debug(`Tenant ${tenant.id}: no active template with code=${templateCode}, skipping`);
        results.push({
          tenantId: tenant.id,
          status: "skipped",
          skipReason: `No active WHATSAPP template with code=${templateCode}`,
        });
        skippedTenants++;
        continue;
      }

      const syntheticActor = buildCronActor(tenant.id);

      try {
        const result = await this.appointmentFollowUpsService.runAppointmentReminder24h(
          syntheticActor,
          {
            templateId: template.id,
            dryRun,
            windowMinutes: input.windowMinutes,
            limit: limitPerTenant,
          },
        );

        results.push({
          tenantId: tenant.id,
          status: "processed",
          summary: result.summary,
        });
        processedTenants++;

        this.logger.log(
          `Tenant ${tenant.id}: sent=${result.summary.sentAppointments} failed=${result.summary.failedAppointments} dryRun=${dryRun}`,
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.error(`Tenant ${tenant.id}: follow-up failed — ${message}`);
        results.push({
          tenantId: tenant.id,
          status: "skipped",
          skipReason: `Error: ${message}`,
        });
        skippedTenants++;
      }
    }

    this.logger.log(
      `Cron appointment-reminders done — processed=${processedTenants} skipped=${skippedTenants} dryRun=${dryRun}`,
    );

    return {
      ranAt,
      dryRun,
      totalTenants: tenants.length,
      processedTenants,
      skippedTenants,
      results,
    };
  }
}

/**
 * Build a synthetic AuthenticatedUser for cron context.
 * The actor has TENANT_ADMIN role scoped to the given tenant,
 * but no real userId — uses a deterministic SYSTEM placeholder.
 */
function buildCronActor(tenantId: string): AuthenticatedUser {
  return {
    id: "00000000-0000-0000-0000-000000000000",
    email: "cron@system.internal",
    fullName: "Cron System",
    status: UserStatus.ACTIVE,
    profile: "clinic",
    roles: [RoleCode.TENANT_ADMIN],
    tenantIds: [tenantId],
    activeTenantId: tenantId,
    availableClinics: [],
    activeClinic: null,
    linkedProfessionalId: null,
    sessionVersion: 0,
  };
}
