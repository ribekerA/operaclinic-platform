import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import {
  AppointmentStatus,
  Prisma,
  PrismaClient,
  SlotHoldStatus,
} from "@prisma/client";
import { AuthenticatedUser } from "../../auth/interfaces/authenticated-user.interface";
import { AUDIT_ACTIONS } from "../../common/audit/audit.constants";
import { AuditService } from "../../common/audit/audit.service";
import { PrismaService } from "../../database/prisma.service";
import { CancelAppointmentDto } from "./dto/cancel-appointment.dto";
import { CreateAppointmentDto } from "./dto/create-appointment.dto";
import { ListAppointmentsQueryDto } from "./dto/list-appointments-query.dto";
import { RescheduleAppointmentDto } from "./dto/reschedule-appointment.dto";
import { AppointmentResponse } from "./interfaces/appointment.response";
import { ProfessionalWorkspaceGateway } from "./gateways/professional-workspace.gateway";
import { SchedulingAccessService } from "./scheduling-access.service";
import { SchedulingConcurrencyService } from "./scheduling-concurrency.service";
import {
  isPrismaUniqueConstraintError,
  isSchedulingOccupancyConflictError,
  prismaErrorTargetsContain,
} from "./scheduling-database-errors";
import { SchedulingPoliciesService } from "./scheduling-policies.service";
import { SchedulingReferencesService } from "./scheduling-references.service";
import { SchedulingTimezoneService } from "./scheduling-timezone.service";

type DbClient = Prisma.TransactionClient | PrismaClient | PrismaService;

const appointmentInclude = {
  patient: {
    select: {
      id: true,
      fullName: true,
    },
  },
  professional: {
    select: {
      id: true,
      fullName: true,
      displayName: true,
    },
  },
  consultationType: {
    select: {
      id: true,
      name: true,
      durationMinutes: true,
      bufferBeforeMinutes: true,
      bufferAfterMinutes: true,
    },
  },
  unit: {
    select: {
      id: true,
      name: true,
    },
  },
} satisfies Prisma.AppointmentInclude;

type AppointmentWithRelations = Prisma.AppointmentGetPayload<{
  include: typeof appointmentInclude;
}>;

interface AppointmentCreateRequestSnapshot {
  patientId: string;
  professionalId: string;
  consultationTypeId: string;
  startsAt: Date;
  unitId: string | null;
  slotHoldId: string | null;
  room: string | null;
  notes: string | null;
}

interface BookingSnapshot {
  durationMinutes: number;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
}

@Injectable()
export class AppointmentsService {
  private readonly logger = new Logger(AppointmentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly accessService: SchedulingAccessService,
    private readonly concurrencyService: SchedulingConcurrencyService,
    private readonly policiesService: SchedulingPoliciesService,
    private readonly referencesService: SchedulingReferencesService,
    private readonly timezoneService: SchedulingTimezoneService,
    private readonly auditService: AuditService,
    private readonly professionalWorkspaceGateway: ProfessionalWorkspaceGateway,
  ) {}

  async createAppointment(
    actor: AuthenticatedUser,
    input: CreateAppointmentDto,
  ): Promise<AppointmentResponse> {
    const tenantId = this.accessService.resolveActiveTenantId(actor);
    const currentInstant = await this.timezoneService.getCurrentInstant();

    const patientId = this.normalizeRequiredId(input.patientId, "patientId");
    const professionalId = this.normalizeRequiredId(input.professionalId, "professionalId");
    const consultationTypeId = this.normalizeRequiredId(
      input.consultationTypeId,
      "consultationTypeId",
    );
    const idempotencyKey = this.normalizeIdempotencyKey(input.idempotencyKey);
    const initialUnitId = input.unitId
      ? this.normalizeRequiredId(input.unitId, "unitId")
      : null;
    const slotHoldId = input.slotHoldId
      ? this.normalizeRequiredId(input.slotHoldId, "slotHoldId")
      : null;
    const room = this.normalizeOptionalText(input.room, 80, "room");
    const notes = this.normalizeOptionalText(input.notes, 5000, "notes");
    const startsAt = this.parseDateTime(input.startsAt, "startsAt");

    if (startsAt.getTime() <= currentInstant.getTime()) {
      throw new BadRequestException("startsAt must be a future datetime.");
    }

    const requestSnapshot: AppointmentCreateRequestSnapshot = {
      patientId,
      professionalId,
      consultationTypeId,
      startsAt,
      unitId: initialUnitId,
      slotHoldId,
      room,
      notes,
    };

    try {
      const appointment = await this.concurrencyService.runExclusiveForProfessional(
        tenantId,
        professionalId,
        async (tx) => {
          const transactionNow = await this.timezoneService.getCurrentInstant(tx);
          const existingByIdempotency = await this.findAppointmentByIdempotency(
            tenantId,
            idempotencyKey,
            tx,
          );

          if (existingByIdempotency) {
            this.assertIdempotentCreateMatches(existingByIdempotency, requestSnapshot);
            return existingByIdempotency;
          }

          await this.referencesService.assertPatientBelongsToTenant(
            patientId,
            tenantId,
            tx,
          );
          await this.referencesService.assertProfessionalBelongsToTenant(
            professionalId,
            tenantId,
            {
              requireActive: true,
            },
            tx,
          );

          let unitId = initialUnitId;
          let holdContext: {
            id: string;
            startsAt: Date;
            unitId: string | null;
            endsAt: Date;
            booking: BookingSnapshot;
          } | null = null;

          const consultationType = await this.referencesService.getActiveConsultationType(
            consultationTypeId,
            tenantId,
            tx,
          );

          await this.policiesService.expireStaleHolds(tenantId, tx, transactionNow);

          if (slotHoldId) {
            const hold = await tx.slotHold.findFirst({
              where: {
                id: slotHoldId,
                tenantId,
              },
              select: {
                id: true,
                status: true,
                startsAt: true,
                endsAt: true,
                expiresAt: true,
                professionalId: true,
                consultationTypeId: true,
                patientId: true,
                unitId: true,
                durationMinutes: true,
                bufferBeforeMinutes: true,
                bufferAfterMinutes: true,
              },
            });

            if (!hold) {
              throw new BadRequestException("slotHoldId is invalid for active tenant.");
            }

            if (
              hold.expiresAt.getTime() <= transactionNow.getTime() ||
              hold.status !== SlotHoldStatus.ACTIVE
            ) {
              throw new ConflictException("Slot hold is not active anymore.");
            }

            if (hold.professionalId !== professionalId) {
              throw new BadRequestException("slotHold professional mismatch.");
            }

            if (hold.consultationTypeId !== consultationTypeId) {
              throw new BadRequestException("slotHold consultation type mismatch.");
            }

            if (hold.patientId && hold.patientId !== patientId) {
              throw new BadRequestException("slotHold patient mismatch.");
            }

            if (hold.startsAt.getTime() !== startsAt.getTime()) {
              throw new BadRequestException("slotHold startsAt mismatch.");
            }

            if (hold.unitId && unitId && hold.unitId !== unitId) {
              throw new BadRequestException("slotHold unit mismatch.");
            }

            if (!unitId && hold.unitId) {
              unitId = hold.unitId;
            }

            holdContext = {
              id: hold.id,
              startsAt: hold.startsAt,
              unitId: hold.unitId,
              endsAt: hold.endsAt,
              booking: {
                durationMinutes: hold.durationMinutes,
                bufferBeforeMinutes: hold.bufferBeforeMinutes,
                bufferAfterMinutes: hold.bufferAfterMinutes,
              },
            };
          }

          await this.referencesService.assertUnitBelongsToTenant(unitId, tenantId, tx);
          await this.referencesService.assertProfessionalAssignedToUnit(
            professionalId,
            unitId,
            tenantId,
            tx,
          );

          const bookingSnapshot: BookingSnapshot = holdContext?.booking ?? {
            durationMinutes: consultationType.durationMinutes,
            bufferBeforeMinutes: consultationType.bufferBeforeMinutes,
            bufferAfterMinutes: consultationType.bufferAfterMinutes,
          };

          await this.policiesService.assertNoSchedulingConflict(
            {
              tenantId,
              professionalId,
              startsAt,
              durationMinutes: bookingSnapshot.durationMinutes,
              bufferBeforeMinutes: bookingSnapshot.bufferBeforeMinutes,
              bufferAfterMinutes: bookingSnapshot.bufferAfterMinutes,
              unitId,
              ignoreHoldId: holdContext?.id,
            },
            tx,
          );

          const window = this.policiesService.calculateAppointmentWindow({
            startsAt,
            durationMinutes: bookingSnapshot.durationMinutes,
            bufferBeforeMinutes: bookingSnapshot.bufferBeforeMinutes,
            bufferAfterMinutes: bookingSnapshot.bufferAfterMinutes,
          });

          if (
            holdContext &&
            holdContext.endsAt.getTime() !== window.endsAt.getTime()
          ) {
            throw new ConflictException("Slot hold window is not consistent anymore.");
          }

          const created = await tx.appointment.create({
            data: {
              tenantId,
              patientId,
              professionalId,
              consultationTypeId,
              unitId,
              slotHoldId: holdContext?.id,
              room,
              startsAt: window.startsAt,
              endsAt: window.endsAt,
              durationMinutes: bookingSnapshot.durationMinutes,
              bufferBeforeMinutes: bookingSnapshot.bufferBeforeMinutes,
              bufferAfterMinutes: bookingSnapshot.bufferAfterMinutes,
              status: AppointmentStatus.BOOKED,
              idempotencyKey,
              notes,
              createdByUserId: actor.id,
              updatedByUserId: actor.id,
            },
          });

          if (holdContext) {
            const consumedHold = await tx.slotHold.updateMany({
              where: {
                id: holdContext.id,
                status: SlotHoldStatus.ACTIVE,
              },
              data: {
                status: SlotHoldStatus.CONSUMED,
              },
            });

            if (consumedHold.count !== 1) {
              throw new ConflictException("Slot hold is not active anymore.");
            }
          }

          await tx.appointmentStatusHistory.create({
            data: {
              tenantId,
              appointmentId: created.id,
              fromStatus: null,
              toStatus: AppointmentStatus.BOOKED,
              changedByUserId: actor.id,
              metadata: {
                source: "create",
              },
            },
          });

          await this.auditService.record(
            {
              action: AUDIT_ACTIONS.APPOINTMENT_CREATED,
              actor,
              tenantId,
              targetType: "appointment",
              targetId: created.id,
              metadata: {
                patientId,
                professionalId,
                consultationTypeId,
                startsAt: created.startsAt.toISOString(),
                endsAt: created.endsAt.toISOString(),
                idempotencyKey,
              },
            },
            tx,
          );

          this.logger.log(
            `Appointment created tenant=${tenantId} appointment=${created.id} patient=${patientId}`,
          );

          return tx.appointment.findUniqueOrThrow({
            where: { id: created.id },
            include: appointmentInclude,
          });
        },
      );

      const mapped = this.mapAppointment(appointment);
      this.emitProfessionalWorkspaceEvent(appointment, "APPOINTMENT_CREATED");
      return mapped;
    } catch (error) {
      if (isPrismaUniqueConstraintError(error)) {
        const byKey = await this.findAppointmentByIdempotency(tenantId, idempotencyKey);

        if (byKey) {
          this.assertIdempotentCreateMatches(byKey, requestSnapshot);
          return this.mapAppointment(byKey);
        }

        if (prismaErrorTargetsContain(error, "appointments_slot_hold_id_key")) {
          throw new ConflictException(
            "Slot hold is already linked to another appointment.",
          );
        }

        throw new ConflictException("Appointment already exists for this idempotency key.");
      }

      if (isSchedulingOccupancyConflictError(error)) {
        throw new ConflictException(
          "Requested slot conflicts with another appointment.",
        );
      }

      throw error;
    }
  }

  async listAppointments(
    actor: AuthenticatedUser,
    query: ListAppointmentsQueryDto,
  ): Promise<AppointmentResponse[]> {
    const tenantId = this.accessService.resolveActiveTenantId(actor);

    const where: Prisma.AppointmentWhereInput = {
      tenantId,
    };

    if (query.professionalId?.trim()) {
      where.professionalId = query.professionalId.trim();
    }

    if (query.patientId?.trim()) {
      where.patientId = query.patientId.trim();
    }

    if (query.status?.trim()) {
      where.status = this.parseAppointmentStatus(query.status.trim());
    }

    if (query.dateFrom?.trim() || query.dateTo?.trim()) {
      where.startsAt = {
        ...(query.dateFrom?.trim()
          ? { gte: this.parseDateTime(query.dateFrom.trim(), "dateFrom") }
          : {}),
        ...(query.dateTo?.trim()
          ? { lte: this.parseDateTime(query.dateTo.trim(), "dateTo") }
          : {}),
      };
    }

    const limit = this.parseLimit(query.limit);

    const appointments = await this.prisma.appointment.findMany({
      where,
      include: appointmentInclude,
      orderBy: {
        startsAt: "desc",
      },
      take: limit,
    });

    return appointments.map((appointment) => this.mapAppointment(appointment));
  }

  async getAppointmentById(
    actor: AuthenticatedUser,
    appointmentId: string,
  ): Promise<AppointmentResponse> {
    const tenantId = this.accessService.resolveActiveTenantId(actor);

    const appointment = await this.prisma.appointment.findFirst({
      where: {
        id: appointmentId,
        tenantId,
      },
      include: appointmentInclude,
    });

    if (!appointment) {
      throw new NotFoundException("Appointment not found.");
    }

    return this.mapAppointment(appointment);
  }

  async rescheduleAppointment(
    actor: AuthenticatedUser,
    appointmentId: string,
    input: RescheduleAppointmentDto,
  ): Promise<AppointmentResponse> {
    const tenantId = this.accessService.resolveActiveTenantId(actor);
    const currentInstant = await this.timezoneService.getCurrentInstant();
    const startsAt = this.parseDateTime(input.startsAt, "startsAt");
    const reason = this.normalizeOptionalText(input.reason, 255, "reason");

    if (startsAt.getTime() <= currentInstant.getTime()) {
      throw new BadRequestException("startsAt must be a future datetime.");
    }

    const lockTarget = await this.resolveLockTarget(tenantId, appointmentId);

    try {
      const updated = await this.concurrencyService.runExclusiveForProfessional(
        tenantId,
        lockTarget.professionalId,
        async (tx) => {
          const transactionNow = await this.timezoneService.getCurrentInstant(tx);
          const appointment = await this.findAppointmentForTenant(
            tenantId,
            appointmentId,
            tx,
          );

          this.policiesService.assertCanReschedule(
            {
              status: appointment.status,
              startsAt: appointment.startsAt,
            },
            transactionNow,
          );

          const room =
            input.room === undefined
              ? appointment.room
              : this.normalizeOptionalText(input.room, 80, "room");
          const unitId =
            input.unitId === undefined ? appointment.unitId : input.unitId.trim() || null;

          await this.referencesService.assertUnitBelongsToTenant(unitId, tenantId, tx);
          await this.referencesService.assertProfessionalAssignedToUnit(
            appointment.professionalId,
            unitId,
            tenantId,
            tx,
          );

          await this.policiesService.assertNoSchedulingConflict(
            {
              tenantId,
              professionalId: appointment.professionalId,
              startsAt,
              durationMinutes: appointment.durationMinutes,
              bufferBeforeMinutes: appointment.bufferBeforeMinutes,
              bufferAfterMinutes: appointment.bufferAfterMinutes,
              unitId,
              excludeAppointmentId: appointment.id,
            },
            tx,
          );

          const window = this.policiesService.calculateAppointmentWindow({
            startsAt,
            durationMinutes: appointment.durationMinutes,
            bufferBeforeMinutes: appointment.bufferBeforeMinutes,
            bufferAfterMinutes: appointment.bufferAfterMinutes,
          });

          const result = await tx.appointment.update({
            where: {
              id: appointment.id,
            },
            data: {
              startsAt: window.startsAt,
              endsAt: window.endsAt,
              room,
              unitId,
              slotHoldId: null,
              status: AppointmentStatus.RESCHEDULED,
              confirmedAt: null,
              checkedInAt: null,
              calledAt: null,
              startedAt: null,
              closureReadyAt: null,
              awaitingPaymentAt: null,
              completedAt: null,
              noShowAt: null,
              cancellationReason: null,
              updatedByUserId: actor.id,
            },
            include: appointmentInclude,
          });

          await tx.appointmentStatusHistory.create({
            data: {
              tenantId,
              appointmentId: appointment.id,
              fromStatus: appointment.status,
              toStatus: AppointmentStatus.RESCHEDULED,
              changedByUserId: actor.id,
              reason,
              metadata: {
                previousStartsAt: appointment.startsAt.toISOString(),
                previousEndsAt: appointment.endsAt.toISOString(),
                newStartsAt: result.startsAt.toISOString(),
                newEndsAt: result.endsAt.toISOString(),
              },
            },
          });

          await this.auditService.record(
            {
              action: AUDIT_ACTIONS.APPOINTMENT_RESCHEDULED,
              actor,
              tenantId,
              targetType: "appointment",
              targetId: appointment.id,
              metadata: {
                previousStartsAt: appointment.startsAt.toISOString(),
                newStartsAt: result.startsAt.toISOString(),
                reason,
              },
            },
            tx,
          );

          this.logger.log(
            `Appointment rescheduled tenant=${tenantId} appointment=${appointment.id}`,
          );

          return result;
        },
      );

      const mapped = this.mapAppointment(updated);
      this.emitProfessionalWorkspaceEvent(updated, "APPOINTMENT_UPDATED");
      return mapped;
    } catch (error) {
      if (isSchedulingOccupancyConflictError(error)) {
        throw new ConflictException(
          "Requested slot conflicts with another appointment.",
        );
      }

      throw error;
    }
  }

  async cancelAppointment(
    actor: AuthenticatedUser,
    appointmentId: string,
    input: CancelAppointmentDto,
  ): Promise<AppointmentResponse> {
    const tenantId = this.accessService.resolveActiveTenantId(actor);
    const reason = this.normalizeRequiredText(input.reason, 255, "reason");
    const lockTarget = await this.resolveLockTarget(tenantId, appointmentId);

    const canceled = await this.concurrencyService.runExclusiveForProfessional(
      tenantId,
      lockTarget.professionalId,
      async (tx) => {
        const transactionNow = await this.timezoneService.getCurrentInstant(tx);
        const appointment = await this.findAppointmentForTenant(
          tenantId,
          appointmentId,
          tx,
        );

        this.policiesService.assertCanCancel(
          {
            status: appointment.status,
            startsAt: appointment.startsAt,
          },
          transactionNow,
        );

        const result = await tx.appointment.update({
          where: {
            id: appointment.id,
          },
          data: {
            status: AppointmentStatus.CANCELED,
            cancellationReason: reason,
            checkedInAt: null,
            calledAt: null,
            startedAt: null,
            closureReadyAt: null,
            awaitingPaymentAt: null,
            completedAt: null,
            noShowAt: null,
            updatedByUserId: actor.id,
          },
          include: appointmentInclude,
        });

        await tx.appointmentStatusHistory.create({
          data: {
            tenantId,
            appointmentId: appointment.id,
            fromStatus: appointment.status,
            toStatus: AppointmentStatus.CANCELED,
            changedByUserId: actor.id,
            reason,
          },
        });

        await this.auditService.record(
          {
            action: AUDIT_ACTIONS.APPOINTMENT_CANCELED,
            actor,
            tenantId,
            targetType: "appointment",
            targetId: appointment.id,
            metadata: {
              reason,
            },
          },
          tx,
        );

        this.logger.log(
          `Appointment canceled tenant=${tenantId} appointment=${appointment.id}`,
        );

        return result;
      },
    );

    const mapped = this.mapAppointment(canceled);
    this.emitProfessionalWorkspaceEvent(canceled, "APPOINTMENT_STATUS_CHANGED");
    return mapped;
  }

  async confirmAppointment(
    actor: AuthenticatedUser,
    appointmentId: string,
    reason?: string,
  ): Promise<AppointmentResponse> {
    const tenantId = this.accessService.resolveActiveTenantId(actor);
    const normalizedReason = this.normalizeOptionalText(reason, 255, "reason");
    const lockTarget = await this.resolveLockTarget(tenantId, appointmentId);

    const confirmed = await this.concurrencyService.runExclusiveForProfessional(
      tenantId,
      lockTarget.professionalId,
      async (tx) => {
        const appointment = await this.findAppointmentForTenant(
          tenantId,
          appointmentId,
          tx,
        );

        this.policiesService.assertCanConfirm({
          status: appointment.status,
          startsAt: appointment.startsAt,
        });

        const now = await this.timezoneService.getCurrentInstant(tx);
        const result = await tx.appointment.update({
          where: {
            id: appointment.id,
          },
          data: {
            status: AppointmentStatus.CONFIRMED,
            confirmedAt: now,
            calledAt: null,
            startedAt: null,
            closureReadyAt: null,
            awaitingPaymentAt: null,
            completedAt: null,
            updatedByUserId: actor.id,
          },
          include: appointmentInclude,
        });

        await tx.appointmentStatusHistory.create({
          data: {
            tenantId,
            appointmentId: appointment.id,
            fromStatus: appointment.status,
            toStatus: AppointmentStatus.CONFIRMED,
            changedByUserId: actor.id,
            reason: normalizedReason,
          },
        });

        await this.auditService.record(
          {
            action: AUDIT_ACTIONS.APPOINTMENT_CONFIRMED,
            actor,
            tenantId,
            targetType: "appointment",
            targetId: appointment.id,
              metadata: {
                confirmedAt: now.toISOString(),
                reason: normalizedReason,
              },
            },
          tx,
        );

        return result;
      },
    );

    const mapped = this.mapAppointment(confirmed);
    this.emitProfessionalWorkspaceEvent(confirmed, "APPOINTMENT_STATUS_CHANGED");
    return mapped;
  }

  async checkInAppointment(
    actor: AuthenticatedUser,
    appointmentId: string,
    reason?: string,
  ): Promise<AppointmentResponse> {
    const tenantId = this.accessService.resolveActiveTenantId(actor);
    const normalizedReason = this.normalizeOptionalText(reason, 255, "reason");
    const lockTarget = await this.resolveLockTarget(tenantId, appointmentId);

    const checkedIn = await this.concurrencyService.runExclusiveForProfessional(
      tenantId,
      lockTarget.professionalId,
      async (tx) => {
        const appointment = await this.findAppointmentForTenant(
          tenantId,
          appointmentId,
          tx,
        );
        const timezone = await this.timezoneService.getTenantTimezone(tenantId, tx);
        const now = await this.timezoneService.getCurrentInstant(tx);

        this.policiesService.assertCanCheckIn(
          {
            status: appointment.status,
            startsAt: appointment.startsAt,
          },
          timezone,
          now,
        );

        const result = await tx.appointment.update({
          where: {
            id: appointment.id,
          },
          data: {
            status: AppointmentStatus.CHECKED_IN,
            checkedInAt: now,
            confirmedAt: appointment.confirmedAt ?? now,
            calledAt: null,
            startedAt: null,
            closureReadyAt: null,
            awaitingPaymentAt: null,
            completedAt: null,
            updatedByUserId: actor.id,
          },
          include: appointmentInclude,
        });

        await tx.appointmentStatusHistory.create({
          data: {
            tenantId,
            appointmentId: appointment.id,
            fromStatus: appointment.status,
            toStatus: AppointmentStatus.CHECKED_IN,
            changedByUserId: actor.id,
            reason: normalizedReason,
          },
        });

        await this.auditService.record(
          {
            action: AUDIT_ACTIONS.APPOINTMENT_CHECKED_IN,
            actor,
            tenantId,
            targetType: "appointment",
            targetId: appointment.id,
              metadata: {
                checkedInAt: now.toISOString(),
                reason: normalizedReason,
              },
            },
          tx,
        );

        return result;
      },
    );

    const mapped = this.mapAppointment(checkedIn);
    this.emitProfessionalWorkspaceEvent(checkedIn, "APPOINTMENT_STATUS_CHANGED");
    return mapped;
  }

  async callAppointment(
    actor: AuthenticatedUser,
    appointmentId: string,
    reason?: string,
  ): Promise<AppointmentResponse> {
    const tenantId = this.accessService.resolveActiveTenantId(actor);
    const normalizedReason = this.normalizeOptionalText(reason, 255, "reason");
    const lockTarget = await this.resolveLockTarget(tenantId, appointmentId);

    const called = await this.concurrencyService.runExclusiveForProfessional(
      tenantId,
      lockTarget.professionalId,
      async (tx) => {
        const appointment = await this.findAppointmentForTenant(
          tenantId,
          appointmentId,
          tx,
        );

        this.policiesService.assertCanCall({
          status: appointment.status,
          startsAt: appointment.startsAt,
        });

        const now = await this.timezoneService.getCurrentInstant(tx);
        const result = await tx.appointment.update({
          where: {
            id: appointment.id,
          },
          data: {
            status: AppointmentStatus.CALLED,
            calledAt: now,
            confirmedAt: appointment.confirmedAt ?? now,
            checkedInAt: appointment.checkedInAt ?? now,
            startedAt: null,
            closureReadyAt: null,
            awaitingPaymentAt: null,
            completedAt: null,
            updatedByUserId: actor.id,
          },
          include: appointmentInclude,
        });

        await tx.appointmentStatusHistory.create({
          data: {
            tenantId,
            appointmentId: appointment.id,
            fromStatus: appointment.status,
            toStatus: AppointmentStatus.CALLED,
            changedByUserId: actor.id,
            reason: normalizedReason,
          },
        });

        await this.auditService.record(
          {
            action: AUDIT_ACTIONS.APPOINTMENT_CALLED,
            actor,
            tenantId,
            targetType: "appointment",
            targetId: appointment.id,
            metadata: {
              calledAt: now.toISOString(),
              reason: normalizedReason,
            },
          },
          tx,
        );

        return result;
      },
    );

    const mapped = this.mapAppointment(called);
    this.emitProfessionalWorkspaceEvent(called, "APPOINTMENT_STATUS_CHANGED");
    return mapped;
  }

  async markAppointmentAsNoShow(
    actor: AuthenticatedUser,
    appointmentId: string,
    reason?: string,
  ): Promise<AppointmentResponse> {
    const tenantId = this.accessService.resolveActiveTenantId(actor);
    const normalizedReason = this.normalizeOptionalText(reason, 255, "reason");
    const lockTarget = await this.resolveLockTarget(tenantId, appointmentId);

    const noShow = await this.concurrencyService.runExclusiveForProfessional(
      tenantId,
      lockTarget.professionalId,
      async (tx) => {
        const appointment = await this.findAppointmentForTenant(
          tenantId,
          appointmentId,
          tx,
        );

        const now = await this.timezoneService.getCurrentInstant(tx);
        this.policiesService.assertCanMarkNoShow(
          {
            status: appointment.status,
            startsAt: appointment.startsAt,
          },
          now,
        );
        const result = await tx.appointment.update({
          where: {
            id: appointment.id,
          },
          data: {
            status: AppointmentStatus.NO_SHOW,
            noShowAt: now,
            calledAt: null,
            startedAt: null,
            closureReadyAt: null,
            awaitingPaymentAt: null,
            completedAt: null,
            updatedByUserId: actor.id,
          },
          include: appointmentInclude,
        });

        await tx.appointmentStatusHistory.create({
          data: {
            tenantId,
            appointmentId: appointment.id,
            fromStatus: appointment.status,
            toStatus: AppointmentStatus.NO_SHOW,
            changedByUserId: actor.id,
            reason: normalizedReason,
          },
        });

        await this.auditService.record(
          {
            action: AUDIT_ACTIONS.APPOINTMENT_NO_SHOW,
            actor,
            tenantId,
            targetType: "appointment",
            targetId: appointment.id,
              metadata: {
                noShowAt: now.toISOString(),
                reason: normalizedReason,
              },
            },
          tx,
        );

        return result;
      },
    );

    const mapped = this.mapAppointment(noShow);
    this.emitProfessionalWorkspaceEvent(noShow, "APPOINTMENT_STATUS_CHANGED");
    return mapped;
  }

  async startAppointment(
    actor: AuthenticatedUser,
    appointmentId: string,
    reason?: string,
  ): Promise<AppointmentResponse> {
    const tenantId = this.accessService.resolveActiveTenantId(actor);
    const normalizedReason = this.normalizeOptionalText(reason, 255, "reason");
    const lockTarget = await this.resolveLockTarget(tenantId, appointmentId);

    const started = await this.concurrencyService.runExclusiveForProfessional(
      tenantId,
      lockTarget.professionalId,
      async (tx) => {
        const appointment = await this.findAppointmentForTenant(
          tenantId,
          appointmentId,
          tx,
        );

        const now = await this.timezoneService.getCurrentInstant(tx);
        this.policiesService.assertCanStart({
          status: appointment.status,
          startsAt: appointment.startsAt,
        });

        const result = await tx.appointment.update({
          where: {
            id: appointment.id,
          },
          data: {
            status: AppointmentStatus.IN_PROGRESS,
            startedAt: now,
            confirmedAt: appointment.confirmedAt ?? now,
            checkedInAt: appointment.checkedInAt ?? now,
            calledAt: appointment.calledAt ?? now,
            closureReadyAt: null,
            awaitingPaymentAt: null,
            completedAt: null,
            updatedByUserId: actor.id,
          },
          include: appointmentInclude,
        });

        await tx.appointmentStatusHistory.create({
          data: {
            tenantId,
            appointmentId: appointment.id,
            fromStatus: appointment.status,
            toStatus: AppointmentStatus.IN_PROGRESS,
            changedByUserId: actor.id,
            reason: normalizedReason,
          },
        });

        await this.auditService.record(
          {
            action: AUDIT_ACTIONS.APPOINTMENT_STARTED,
            actor,
            tenantId,
            targetType: "appointment",
            targetId: appointment.id,
            metadata: {
              startedAt: now.toISOString(),
              reason: normalizedReason,
            },
          },
          tx,
        );

        return result;
      },
    );

    const mapped = this.mapAppointment(started);
    this.emitProfessionalWorkspaceEvent(started, "APPOINTMENT_STATUS_CHANGED");
    return mapped;
  }

  async prepareAppointmentClosure(
    actor: AuthenticatedUser,
    appointmentId: string,
    reason?: string,
  ): Promise<AppointmentResponse> {
    const tenantId = this.accessService.resolveActiveTenantId(actor);
    const normalizedReason = this.normalizeOptionalText(reason, 255, "reason");
    const lockTarget = await this.resolveLockTarget(tenantId, appointmentId);

    const awaitingClosure = await this.concurrencyService.runExclusiveForProfessional(
      tenantId,
      lockTarget.professionalId,
      async (tx) => {
        const appointment = await this.findAppointmentForTenant(
          tenantId,
          appointmentId,
          tx,
        );

        this.policiesService.assertCanPrepareClosure({
          status: appointment.status,
          startsAt: appointment.startsAt,
        });

        const now = await this.timezoneService.getCurrentInstant(tx);
        const result = await tx.appointment.update({
          where: {
            id: appointment.id,
          },
          data: {
            status: AppointmentStatus.AWAITING_CLOSURE,
            confirmedAt: appointment.confirmedAt ?? now,
            checkedInAt: appointment.checkedInAt ?? now,
            calledAt: appointment.calledAt ?? now,
            startedAt: appointment.startedAt ?? now,
            closureReadyAt: now,
            awaitingPaymentAt: null,
            completedAt: null,
            updatedByUserId: actor.id,
          },
          include: appointmentInclude,
        });

        await tx.appointmentStatusHistory.create({
          data: {
            tenantId,
            appointmentId: appointment.id,
            fromStatus: appointment.status,
            toStatus: AppointmentStatus.AWAITING_CLOSURE,
            changedByUserId: actor.id,
            reason: normalizedReason,
          },
        });

        await this.auditService.record(
          {
            action: AUDIT_ACTIONS.APPOINTMENT_AWAITING_CLOSURE,
            actor,
            tenantId,
            targetType: "appointment",
            targetId: appointment.id,
            metadata: {
              closureReadyAt: now.toISOString(),
              reason: normalizedReason,
            },
          },
          tx,
        );

        return result;
      },
    );

    const mapped = this.mapAppointment(awaitingClosure);
    this.emitProfessionalWorkspaceEvent(
      awaitingClosure,
      "APPOINTMENT_STATUS_CHANGED",
    );
    return mapped;
  }

  async completeAppointment(
    actor: AuthenticatedUser,
    appointmentId: string,
    reason?: string,
  ): Promise<AppointmentResponse> {
    const tenantId = this.accessService.resolveActiveTenantId(actor);
    const normalizedReason = this.normalizeOptionalText(reason, 255, "reason");
    const lockTarget = await this.resolveLockTarget(tenantId, appointmentId);

    const awaitingPayment = await this.concurrencyService.runExclusiveForProfessional(
      tenantId,
      lockTarget.professionalId,
      async (tx) => {
        const appointment = await this.findAppointmentForTenant(
          tenantId,
          appointmentId,
          tx,
        );

        const now = await this.timezoneService.getCurrentInstant(tx);
        this.policiesService.assertCanSendToReception({
          status: appointment.status,
          startsAt: appointment.startsAt,
        });

        const result = await tx.appointment.update({
          where: {
            id: appointment.id,
          },
          data: {
            status: AppointmentStatus.AWAITING_PAYMENT,
            confirmedAt: appointment.confirmedAt ?? now,
            checkedInAt: appointment.checkedInAt ?? now,
            calledAt: appointment.calledAt ?? now,
            startedAt: appointment.startedAt ?? now,
            closureReadyAt: appointment.closureReadyAt ?? now,
            awaitingPaymentAt: now,
            completedAt: null,
            updatedByUserId: actor.id,
          },
          include: appointmentInclude,
        });

        await tx.appointmentStatusHistory.create({
          data: {
            tenantId,
            appointmentId: appointment.id,
            fromStatus: appointment.status,
            toStatus: AppointmentStatus.AWAITING_PAYMENT,
            changedByUserId: actor.id,
            reason: normalizedReason,
          },
        });

        await this.auditService.record(
          {
            action: AUDIT_ACTIONS.APPOINTMENT_AWAITING_PAYMENT,
            actor,
            tenantId,
            targetType: "appointment",
            targetId: appointment.id,
            metadata: {
              awaitingPaymentAt: now.toISOString(),
              reason: normalizedReason,
            },
          },
          tx,
        );

        return result;
      },
    );

    const mapped = this.mapAppointment(awaitingPayment);
    this.emitProfessionalWorkspaceEvent(
      awaitingPayment,
      "APPOINTMENT_STATUS_CHANGED",
    );
    return mapped;
  }

  async finalizeAppointment(
    actor: AuthenticatedUser,
    appointmentId: string,
    reason?: string,
  ): Promise<AppointmentResponse> {
    const tenantId = this.accessService.resolveActiveTenantId(actor);
    const normalizedReason = this.normalizeOptionalText(reason, 255, "reason");
    const lockTarget = await this.resolveLockTarget(tenantId, appointmentId);

    const completed = await this.concurrencyService.runExclusiveForProfessional(
      tenantId,
      lockTarget.professionalId,
      async (tx) => {
        const appointment = await this.findAppointmentForTenant(
          tenantId,
          appointmentId,
          tx,
        );

        const now = await this.timezoneService.getCurrentInstant(tx);
        this.policiesService.assertCanComplete({
          status: appointment.status,
          startsAt: appointment.startsAt,
        });

        const result = await tx.appointment.update({
          where: {
            id: appointment.id,
          },
          data: {
            status: AppointmentStatus.COMPLETED,
            confirmedAt: appointment.confirmedAt ?? now,
            checkedInAt: appointment.checkedInAt ?? now,
            calledAt: appointment.calledAt ?? now,
            startedAt: appointment.startedAt ?? now,
            closureReadyAt: appointment.closureReadyAt ?? now,
            awaitingPaymentAt: appointment.awaitingPaymentAt ?? now,
            completedAt: now,
            updatedByUserId: actor.id,
          },
          include: appointmentInclude,
        });

        await tx.appointmentStatusHistory.create({
          data: {
            tenantId,
            appointmentId: appointment.id,
            fromStatus: appointment.status,
            toStatus: AppointmentStatus.COMPLETED,
            changedByUserId: actor.id,
            reason: normalizedReason,
          },
        });

        await this.auditService.record(
          {
            action: AUDIT_ACTIONS.APPOINTMENT_COMPLETED,
            actor,
            tenantId,
            targetType: "appointment",
            targetId: appointment.id,
            metadata: {
              completedAt: now.toISOString(),
              reason: normalizedReason,
            },
          },
          tx,
        );

        return result;
      },
    );

    const mapped = this.mapAppointment(completed);
    this.emitProfessionalWorkspaceEvent(completed, "APPOINTMENT_STATUS_CHANGED");
    return mapped;
  }

  async updateAppointmentNotes(
    actor: AuthenticatedUser,
    appointmentId: string,
    notes?: string,
  ): Promise<AppointmentResponse> {
    const tenantId = this.accessService.resolveActiveTenantId(actor);
    const normalizedNotes = this.normalizeOptionalText(notes, 2000, "notes");
    const lockTarget = await this.resolveLockTarget(tenantId, appointmentId);

    const updated = await this.concurrencyService.runExclusiveForProfessional(
      tenantId,
      lockTarget.professionalId,
      async (tx) => {
        const appointment = await this.findAppointmentForTenant(
          tenantId,
          appointmentId,
          tx,
        );

        const result = await tx.appointment.update({
          where: {
            id: appointment.id,
          },
          data: {
            notes: normalizedNotes,
            updatedByUserId: actor.id,
          },
          include: appointmentInclude,
        });

        await this.auditService.record(
          {
            action: AUDIT_ACTIONS.APPOINTMENT_NOTES_UPDATED,
            actor,
            tenantId,
            targetType: "appointment",
            targetId: appointment.id,
            metadata: {
              hasNotes: Boolean(normalizedNotes),
            },
          },
          tx,
        );

        return result;
      },
    );

    const mapped = this.mapAppointment(updated);
    this.emitProfessionalWorkspaceEvent(updated, "APPOINTMENT_NOTES_UPDATED");
    return mapped;
  }

  private async resolveLockTarget(
    tenantId: string,
    appointmentId: string,
  ): Promise<{ professionalId: string }> {
    const appointment = await this.prisma.appointment.findFirst({
      where: {
        id: appointmentId,
        tenantId,
      },
      select: {
        professionalId: true,
      },
    });

    if (!appointment) {
      throw new NotFoundException("Appointment not found.");
    }

    return appointment;
  }

  private async findAppointmentForTenant(
    tenantId: string,
    appointmentId: string,
    dbClient?: DbClient,
  ): Promise<
    Prisma.AppointmentGetPayload<{
      include: typeof appointmentInclude;
    }>
  > {
    const db = dbClient ?? this.prisma;

    const appointment = await db.appointment.findFirst({
      where: {
        id: appointmentId,
        tenantId,
      },
      include: appointmentInclude,
    });

    if (!appointment) {
      throw new NotFoundException("Appointment not found.");
    }

    return appointment;
  }

  private async findAppointmentByIdempotency(
    tenantId: string,
    idempotencyKey: string,
    dbClient?: DbClient,
  ): Promise<AppointmentWithRelations | null> {
    const db = dbClient ?? this.prisma;

    return db.appointment.findUnique({
      where: {
        tenantId_idempotencyKey: {
          tenantId,
          idempotencyKey,
        },
      },
      include: appointmentInclude,
    });
  }

  private assertIdempotentCreateMatches(
    appointment: AppointmentWithRelations,
    input: AppointmentCreateRequestSnapshot,
  ): void {
    const expectedUnitId =
      input.unitId ??
      (input.slotHoldId && appointment.slotHoldId === input.slotHoldId
        ? appointment.unitId
        : null);

    const matches =
      appointment.patientId === input.patientId &&
      appointment.professionalId === input.professionalId &&
      appointment.consultationTypeId === input.consultationTypeId &&
      appointment.startsAt.getTime() === input.startsAt.getTime() &&
      appointment.unitId === expectedUnitId &&
      appointment.slotHoldId === input.slotHoldId &&
      appointment.room === input.room &&
      appointment.notes === input.notes;

    if (!matches) {
      throw new ConflictException(
        "idempotencyKey is already bound to a different appointment create request.",
      );
    }
  }

  private parseDateTime(value: string, fieldName: string): Date {
    return this.timezoneService.parseIsoInstant(value, fieldName);
  }

  private parseAppointmentStatus(value: string): AppointmentStatus {
    if ((Object.values(AppointmentStatus) as string[]).includes(value)) {
      return value as AppointmentStatus;
    }

    throw new BadRequestException("Invalid appointment status.");
  }

  private parseLimit(rawLimit: string | undefined): number {
    if (!rawLimit) {
      return 100;
    }

    const parsed = Number.parseInt(rawLimit, 10);

    if (Number.isNaN(parsed) || parsed <= 0) {
      throw new BadRequestException("limit must be a positive integer.");
    }

    return Math.min(parsed, 300);
  }

  private normalizeRequiredId(value: string, fieldName: string): string {
    const normalized = value?.trim();

    if (!normalized) {
      throw new BadRequestException(`${fieldName} is required.`);
    }

    return normalized;
  }

  private normalizeIdempotencyKey(value: string): string {
    const normalized = this.normalizeRequiredId(value, "idempotencyKey");

    if (normalized.length > 120) {
      throw new BadRequestException("idempotencyKey exceeds max length 120.");
    }

    return normalized;
  }

  private normalizeOptionalText(
    value: string | undefined,
    maxLength: number,
    fieldName: string,
  ): string | null {
    if (value === undefined) {
      return null;
    }

    const normalized = value.trim();

    if (!normalized) {
      return null;
    }

    if (normalized.length > maxLength) {
      throw new BadRequestException(`${fieldName} exceeds max length ${maxLength}.`);
    }

    return normalized;
  }

  private normalizeRequiredText(
    value: string,
    maxLength: number,
    fieldName: string,
  ): string {
    const normalized = value?.trim();

    if (!normalized) {
      throw new BadRequestException(`${fieldName} is required.`);
    }

    if (normalized.length > maxLength) {
      throw new BadRequestException(`${fieldName} exceeds max length ${maxLength}.`);
    }

    return normalized;
  }

  private mapAppointment(appointment: AppointmentWithRelations): AppointmentResponse {
    return {
      id: appointment.id,
      tenantId: appointment.tenantId,
      patientId: appointment.patientId,
      professionalId: appointment.professionalId,
      consultationTypeId: appointment.consultationTypeId,
      unitId: appointment.unitId,
      slotHoldId: appointment.slotHoldId,
      room: appointment.room,
      startsAt: appointment.startsAt,
      endsAt: appointment.endsAt,
      durationMinutes: appointment.durationMinutes,
      bufferBeforeMinutes: appointment.bufferBeforeMinutes,
      bufferAfterMinutes: appointment.bufferAfterMinutes,
      status: appointment.status,
      confirmedAt: appointment.confirmedAt,
      checkedInAt: appointment.checkedInAt,
      calledAt: appointment.calledAt,
      startedAt: appointment.startedAt,
      closureReadyAt: appointment.closureReadyAt,
      awaitingPaymentAt: appointment.awaitingPaymentAt,
      completedAt: appointment.completedAt,
      noShowAt: appointment.noShowAt,
      idempotencyKey: appointment.idempotencyKey,
      cancellationReason: appointment.cancellationReason,
      notes: appointment.notes,
      createdByUserId: appointment.createdByUserId,
      updatedByUserId: appointment.updatedByUserId,
      createdAt: appointment.createdAt,
      updatedAt: appointment.updatedAt,
      patient: {
        id: appointment.patient.id,
        fullName: appointment.patient.fullName,
      },
      professional: {
        id: appointment.professional.id,
        fullName: appointment.professional.fullName,
        displayName: appointment.professional.displayName,
      },
      consultationType: {
        id: appointment.consultationType.id,
        name: appointment.consultationType.name,
        durationMinutes: appointment.consultationType.durationMinutes,
        bufferBeforeMinutes: appointment.consultationType.bufferBeforeMinutes,
        bufferAfterMinutes: appointment.consultationType.bufferAfterMinutes,
      },
      unit: appointment.unit
        ? {
            id: appointment.unit.id,
            name: appointment.unit.name,
          }
        : null,
    };
  }

  private emitProfessionalWorkspaceEvent(
    appointment: AppointmentWithRelations,
    event:
      | "APPOINTMENT_CREATED"
      | "APPOINTMENT_UPDATED"
      | "APPOINTMENT_STATUS_CHANGED"
      | "APPOINTMENT_NOTES_UPDATED",
  ): void {
    try {
      this.professionalWorkspaceGateway.emitDashboardUpdated({
        appointmentId: appointment.id,
        tenantId: appointment.tenantId,
        professionalId: appointment.professionalId,
        status: appointment.status,
        event,
        occurredAt: new Date().toISOString(),
      });
    } catch (error) {
      this.logger.warn(
        `Failed to emit professional workspace realtime event appointment=${appointment.id}: ${String(error)}`,
      );
    }
  }
}
