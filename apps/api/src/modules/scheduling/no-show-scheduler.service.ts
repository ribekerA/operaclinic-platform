import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { AppointmentStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../../database/prisma.service";
import { AUDIT_ACTIONS } from "../../common/audit/audit.constants";
import { OperationalLoggerService } from "../../common/observability/operational-logger.service";
import { OperationalObservabilityService } from "../../common/observability/operational-observability.service";

/**
 * NoShowSchedulerService
 *
 * Runs every 15 minutes (configurable via NO_SHOW_INTERVAL_MS env var).
 * Marks CONFIRMED or BOOKED appointments that ended more than 15 minutes ago
 * as NO_SHOW, writes status history and an audit log for each.
 *
 * Rationale: prevents the clinic from losing visibility on missed slots in
 * real-time. Same logic as the manual `markAppointmentAsNoShow()` action,
 * but driven by the system clock without requiring human input.
 *
 * Authority: Backend scheduling module is the authority. No agent calls this
 * directly; it fires on an internal timer.
 */
@Injectable()
export class NoShowSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NoShowSchedulerService.name);
  private intervalHandle: NodeJS.Timeout | null = null;

  /** Grace period after appointment end before marking as NO_SHOW (ms). */
  private static readonly NO_SHOW_GRACE_MS = 15 * 60 * 1_000; // 15 minutes

  /** How often the job runs (default 15 min, override via env). */
  private static readonly INTERVAL_MS =
    Number(process.env["NO_SHOW_INTERVAL_MS"] ?? 15 * 60 * 1_000) ||
    15 * 60 * 1_000;

  /** Statuses that are eligible to transition to NO_SHOW automatically. */
  private static readonly ELIGIBLE_STATUSES: AppointmentStatus[] = [
    AppointmentStatus.BOOKED,
    AppointmentStatus.CONFIRMED,
  ];

  /** Batch size per DB query to avoid large lock windows. */
  private static readonly BATCH_LIMIT = 200;

  constructor(
    private readonly prisma: PrismaService,
    private readonly opLogger: OperationalLoggerService,
    private readonly observability: OperationalObservabilityService,
  ) {}

  onModuleInit(): void {
    this.intervalHandle = setInterval(() => {
      void this.runNoShowSweep();
    }, NoShowSchedulerService.INTERVAL_MS);

    this.logger.log(
      `NoShowScheduler started — interval=${NoShowSchedulerService.INTERVAL_MS}ms grace=${NoShowSchedulerService.NO_SHOW_GRACE_MS}ms`,
    );
  }

  onModuleDestroy(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }

  /**
   * Public for manual invocation in tests or admin tooling.
   * Returns the count of appointments transitioned to NO_SHOW.
   */
  async runNoShowSweep(): Promise<number> {
    const cutoff = new Date(Date.now() - NoShowSchedulerService.NO_SHOW_GRACE_MS);

    let total = 0;

    try {
      const candidates = await this.prisma.appointment.findMany({
        where: {
          status: { in: NoShowSchedulerService.ELIGIBLE_STATUSES },
          endsAt: { lt: cutoff },
        },
        select: {
          id: true,
          tenantId: true,
          patientId: true,
          professionalId: true,
          startsAt: true,
          endsAt: true,
          status: true,
        },
        take: NoShowSchedulerService.BATCH_LIMIT,
      });

      if (candidates.length === 0) {
        return 0;
      }

      const now = new Date();

      for (const appointment of candidates) {
        try {
          await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
            const result = await tx.appointment.updateMany({
              where: {
                id: appointment.id,
                // Guard: only transition if still in an eligible status
                // (another request may have transitioned it concurrently).
                status: { in: NoShowSchedulerService.ELIGIBLE_STATUSES },
              },
              data: {
                status: AppointmentStatus.NO_SHOW,
                noShowAt: now,
              },
            });

            if (result.count === 0) {
              // Already transitioned by concurrent request — idempotent skip.
              return;
            }

            await tx.appointmentStatusHistory.create({
              data: {
                tenantId: appointment.tenantId,
                appointmentId: appointment.id,
                fromStatus: appointment.status,
                toStatus: AppointmentStatus.NO_SHOW,
                changedByUserId: null,
                reason: "Automatic no-show: appointment ended without check-in",
                metadata: {
                  source: "no_show_scheduler",
                  cutoff: cutoff.toISOString(),
                } as Prisma.InputJsonValue,
              },
            });

            await tx.auditLog.create({
              data: {
                action: AUDIT_ACTIONS.APPOINTMENT_NO_SHOW,
                actorUserId: null,
                actorProfile: "system:no_show_scheduler",
                actorRoles: [],
                tenantId: appointment.tenantId,
                targetType: "appointment",
                targetId: appointment.id,
                metadata: {
                  source: "auto",
                  patientId: appointment.patientId,
                  professionalId: appointment.professionalId,
                  endsAt: appointment.endsAt.toISOString(),
                  noShowAt: now.toISOString(),
                } as Prisma.InputJsonValue,
              },
            });
          });

          total += 1;
          this.observability.incrementCounter("no_show.auto_marked", appointment.tenantId);
        } catch (apptError: unknown) {
          // Log individual appointment failure but continue processing remaining.
          this.logger.warn(
            `NoShowScheduler: failed to process appointment ${appointment.id} — ${apptError instanceof Error ? apptError.message : String(apptError)}`,
          );
        }
      }

      if (total > 0) {
        this.opLogger.info("no_show_sweep.completed", {
          total,
          cutoff: cutoff.toISOString(),
        });
      }
    } catch (sweepError: unknown) {
      this.opLogger.error(
        "no_show_sweep.error",
        { errorMessage: sweepError instanceof Error ? sweepError.message : String(sweepError) },
        sweepError instanceof Error ? sweepError.stack : undefined,
      );
    }

    return total;
  }
}
