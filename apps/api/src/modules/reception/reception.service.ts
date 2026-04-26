import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type {
  ReceptionAppointmentDetail,
  ReceptionDashboardResponse,
  ReceptionDayAgendaResponse,
  ReceptionOperationalStatusAction,
  ReceptionPatientSummary,
  ReceptionStatusHistoryEntry,
} from "@operaclinic/shared";
import { PatientProtocolStatus, Prisma, ProtocolSessionStatus } from "@prisma/client";
import { AuthenticatedUser } from "../../auth/interfaces/authenticated-user.interface";
import { PrismaService } from "../../database/prisma.service";
import { PatientsService } from "../patients/patients.service";
import { AppointmentsService } from "../scheduling/appointments.service";
import { AvailabilityService } from "../scheduling/availability.service";
import { SchedulingAccessService } from "../scheduling/scheduling-access.service";
import { SchedulingTimezoneService } from "../scheduling/scheduling-timezone.service";
import { CancelReceptionAppointmentDto } from "./dto/cancel-reception-appointment.dto";
import { CreateReceptionAppointmentDto } from "./dto/create-reception-appointment.dto";
import { ReceptionDateQueryDto } from "./dto/reception-date-query.dto";
import { ReceptionPatientSearchQueryDto } from "./dto/reception-patient-search-query.dto";
import { ReceptionStatusActionDto } from "./dto/reception-status-action.dto";
import { UpdateReceptionAppointmentStatusDto } from "./dto/update-reception-appointment-status.dto";
import { RescheduleReceptionAppointmentDto } from "./dto/reschedule-reception-appointment.dto";

const receptionAppointmentInclude = {
  patient: {
    include: {
      contacts: {
        orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
      },
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
  statusHistory: {
    orderBy: {
      createdAt: "desc",
    },
  },
} satisfies Prisma.AppointmentInclude;

type ReceptionAppointmentRecord = Prisma.AppointmentGetPayload<{
  include: typeof receptionAppointmentInclude;
}>;

@Injectable()
export class ReceptionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accessService: SchedulingAccessService,
    private readonly timezoneService: SchedulingTimezoneService,
    private readonly availabilityService: AvailabilityService,
    private readonly appointmentsService: AppointmentsService,
    private readonly patientsService: PatientsService,
  ) {}

  async getDashboard(
    actor: AuthenticatedUser,
    query: ReceptionDateQueryDto,
  ): Promise<ReceptionDashboardResponse> {
    const { tenantId, dayContext } = await this.resolveDayContext(actor, query.date);

    const appointments = await this.prisma.appointment.findMany({
      where: {
        tenantId,
        startsAt: {
          gte: dayContext.dayStartUtc,
          lt: dayContext.dayEndUtcExclusive,
        },
      },
      include: receptionAppointmentInclude,
      orderBy: {
        startsAt: "asc",
      },
    });

    const agendaItems = appointments.map((appointment) => this.mapAgendaAppointment(appointment));
    const queue = agendaItems
      .filter((appointment) => appointment.status === "CHECKED_IN")
      .sort((left, right) =>
        (left.checkedInAt ?? left.startsAt).localeCompare(right.checkedInAt ?? right.startsAt),
      );
    const nextAppointments = agendaItems
      .filter((appointment) =>
        ["BOOKED", "CONFIRMED", "RESCHEDULED", "CHECKED_IN"].includes(appointment.status),
      )
      .slice(0, 8);

    return {
      timezone: dayContext.timezone,
      date: dayContext.date,
      totals: {
        totalAppointments: agendaItems.length,
        pendingConfirmation: agendaItems.filter((appointment) =>
          ["BOOKED", "RESCHEDULED"].includes(appointment.status),
        ).length,
        checkedIn: queue.length,
        inService: agendaItems.filter((appointment) =>
          ["CALLED", "IN_PROGRESS", "AWAITING_CLOSURE"].includes(
            appointment.status,
          ),
        ).length,
        awaitingPayment: agendaItems.filter(
          (appointment) => appointment.status === "AWAITING_PAYMENT",
        ).length,
        canceled: agendaItems.filter((appointment) => appointment.status === "CANCELED")
          .length,
        noShow: agendaItems.filter((appointment) => appointment.status === "NO_SHOW").length,
      },
      queue,
      nextAppointments,
    };
  }

  async getDayAgenda(
    actor: AuthenticatedUser,
    query: ReceptionDateQueryDto,
  ): Promise<ReceptionDayAgendaResponse> {
    const { tenantId, dayContext } = await this.resolveDayContext(actor, query.date);

    const appointments = await this.prisma.appointment.findMany({
      where: {
        tenantId,
        startsAt: {
          gte: dayContext.dayStartUtc,
          lt: dayContext.dayEndUtcExclusive,
        },
        ...(query.professionalId?.trim()
          ? {
              professionalId: query.professionalId.trim(),
            }
          : {}),
        ...(query.unitId?.trim()
          ? {
              unitId: query.unitId.trim(),
            }
          : {}),
      },
      include: receptionAppointmentInclude,
      orderBy: {
        startsAt: "asc",
      },
    });

    return {
      timezone: dayContext.timezone,
      date: dayContext.date,
      appointments: appointments.map((appointment) => this.mapAgendaAppointment(appointment)),
    };
  }

  async getAppointmentDetail(
    actor: AuthenticatedUser,
    appointmentId: string,
  ): Promise<ReceptionAppointmentDetail> {
    const tenantId = this.accessService.resolveActiveTenantId(actor);

    const appointment = await this.prisma.appointment.findFirst({
      where: {
        id: appointmentId,
        tenantId,
      },
      include: receptionAppointmentInclude,
    });

    if (!appointment) {
      throw new NotFoundException("Appointment not found.");
    }

    return this.mapAppointmentDetail(appointment);
  }

  async searchPatients(
    actor: AuthenticatedUser,
    query: ReceptionPatientSearchQueryDto,
  ): Promise<ReceptionPatientSummary[]> {
    const patients = await this.patientsService.listPatients(actor, {
      search: query.search,
      contactValue: query.contactValue,
      limit: query.limit,
      isActive: "true",
    });

    return patients.map((patient) => ({
      id: patient.id,
      fullName: patient.fullName,
      birthDate: patient.birthDate ? patient.birthDate.toISOString() : null,
      documentNumber: patient.documentNumber,
      notes: patient.notes,
      isActive: patient.isActive,
      contacts: patient.contacts.map((contact) => ({
        id: contact.id,
        type: contact.type,
        value: contact.value,
        normalizedValue: contact.normalizedValue,
        isPrimary: contact.isPrimary,
      })),
    }));
  }

  async searchAvailability(actor: AuthenticatedUser, query: {
    professionalId: string;
    consultationTypeId: string;
    date: string;
    unitId?: string;
  }) {
    const availability = await this.availabilityService.searchAvailability(actor, query);

    return availability.map((slot) => ({
      startsAt: slot.startsAt.toISOString(),
      endsAt: slot.endsAt.toISOString(),
      occupancyStartsAt: slot.occupancyStartsAt.toISOString(),
      occupancyEndsAt: slot.occupancyEndsAt.toISOString(),
      professionalId: slot.professionalId,
      unitId: slot.unitId,
    }));
  }

  async createManualAppointment(
    actor: AuthenticatedUser,
    input: CreateReceptionAppointmentDto,
  ): Promise<ReceptionAppointmentDetail> {
    const created = await this.appointmentsService.createAppointment(actor, input);

    if (input.procedureProtocolId) {
      await this.linkAppointmentToProtocol(actor, created.id, input.procedureProtocolId);
    }

    return this.getAppointmentDetail(actor, created.id);
  }

  private async linkAppointmentToProtocol(
    actor: AuthenticatedUser,
    appointmentId: string,
    procedureProtocolId: string,
  ): Promise<void> {
    const tenantId = this.accessService.resolveActiveTenantId(actor);

    await this.prisma.$transaction(async (tx) => {
      const appointment = await tx.appointment.findFirst({
        where: {
          id: appointmentId,
          tenantId,
        },
        select: {
          id: true,
          patientId: true,
          consultationTypeId: true,
          startsAt: true,
        },
      });

      if (!appointment) {
        throw new NotFoundException("Appointment not found.");
      }

      const protocol = await tx.procedureProtocol.findFirst({
        where: {
          id: procedureProtocolId,
          tenantId,
          isActive: true,
        },
        select: {
          id: true,
          consultationTypeId: true,
          totalSessions: true,
          intervalBetweenSessionsDays: true,
        },
      });

      if (!protocol) {
        throw new NotFoundException("Procedure protocol not found.");
      }

      if (protocol.consultationTypeId !== appointment.consultationTypeId) {
        throw new BadRequestException(
          "Procedure protocol must match appointment consultation type.",
        );
      }

      const existingByAppointment = await tx.protocolSessionAppointment.findFirst({
        where: {
          tenantId,
          appointmentId: appointment.id,
        },
        select: {
          id: true,
          procedureProtocolId: true,
        },
      });

      if (existingByAppointment) {
        if (existingByAppointment.procedureProtocolId !== protocol.id) {
          throw new BadRequestException(
            "Appointment is already linked to a different procedure protocol.",
          );
        }

        return;
      }

      const expectedCompletionAt = new Date(appointment.startsAt);
      expectedCompletionAt.setUTCDate(
        expectedCompletionAt.getUTCDate() +
          Math.max(0, protocol.totalSessions - 1) * protocol.intervalBetweenSessionsDays,
      );

      const protocolInstance = await tx.patientProtocolInstance.upsert({
        where: {
          patientId_procedureProtocolId: {
            patientId: appointment.patientId,
            procedureProtocolId: protocol.id,
          },
        },
        update: {
          status: PatientProtocolStatus.ACTIVE,
          sessionsPlanned: protocol.totalSessions,
          expectedCompletionAt,
        },
        create: {
          tenantId,
          patientId: appointment.patientId,
          procedureProtocolId: protocol.id,
          status: PatientProtocolStatus.ACTIVE,
          sessionsPlanned: protocol.totalSessions,
          expectedCompletionAt,
        },
        select: {
          id: true,
          sessionsScheduled: true,
        },
      });

      const existingSessions = await tx.protocolSessionAppointment.count({
        where: {
          tenantId,
          patientProtocolInstanceId: protocolInstance.id,
        },
      });

      const nextSequence = existingSessions + 1;

      if (nextSequence > protocol.totalSessions) {
        throw new BadRequestException(
          "All protocol sessions are already scheduled for this patient.",
        );
      }

      await tx.protocolSessionAppointment.create({
        data: {
          tenantId,
          patientProtocolInstanceId: protocolInstance.id,
          procedureProtocolId: protocol.id,
          appointmentId: appointment.id,
          sessionSequence: nextSequence,
          status: ProtocolSessionStatus.SCHEDULED,
          plannedStartDate: appointment.startsAt,
        },
      });

      await tx.patientProtocolInstance.update({
        where: { id: protocolInstance.id },
        data: {
          sessionsScheduled: Math.max(protocolInstance.sessionsScheduled, nextSequence),
        },
      });
    });
  }

  async rescheduleAppointment(
    actor: AuthenticatedUser,
    appointmentId: string,
    input: RescheduleReceptionAppointmentDto,
  ): Promise<ReceptionAppointmentDetail> {
    const updated = await this.appointmentsService.rescheduleAppointment(
      actor,
      appointmentId,
      input,
    );
    return this.getAppointmentDetail(actor, updated.id);
  }

  async cancelAppointment(
    actor: AuthenticatedUser,
    appointmentId: string,
    input: CancelReceptionAppointmentDto,
  ): Promise<ReceptionAppointmentDetail> {
    const canceled = await this.appointmentsService.cancelAppointment(
      actor,
      appointmentId,
      input,
    );
    return this.getAppointmentDetail(actor, canceled.id);
  }

  async confirmAppointment(
    actor: AuthenticatedUser,
    appointmentId: string,
    input: ReceptionStatusActionDto,
  ): Promise<ReceptionAppointmentDetail> {
    const confirmed = await this.appointmentsService.confirmAppointment(
      actor,
      appointmentId,
      input.reason,
    );
    return this.getAppointmentDetail(actor, confirmed.id);
  }

  async checkInAppointment(
    actor: AuthenticatedUser,
    appointmentId: string,
    input: ReceptionStatusActionDto,
  ): Promise<ReceptionAppointmentDetail> {
    const checkedIn = await this.appointmentsService.checkInAppointment(
      actor,
      appointmentId,
      input.reason,
    );
    return this.getAppointmentDetail(actor, checkedIn.id);
  }

  async markAppointmentAsNoShow(
    actor: AuthenticatedUser,
    appointmentId: string,
    input: ReceptionStatusActionDto,
  ): Promise<ReceptionAppointmentDetail> {
    const noShow = await this.appointmentsService.markAppointmentAsNoShow(
      actor,
      appointmentId,
      input.reason,
    );
    return this.getAppointmentDetail(actor, noShow.id);
  }

  async updateAppointmentStatus(
    actor: AuthenticatedUser,
    appointmentId: string,
    input: UpdateReceptionAppointmentStatusDto,
  ): Promise<ReceptionAppointmentDetail> {
    const status = this.parseStatusAction(input.status);

    switch (status) {
      case "CONFIRMED":
        return this.confirmAppointment(actor, appointmentId, input);
      case "CHECKED_IN":
        return this.checkInAppointment(actor, appointmentId, input);
      case "NO_SHOW":
        return this.markAppointmentAsNoShow(actor, appointmentId, input);
      case "COMPLETED": {
        const completed = await this.appointmentsService.finalizeAppointment(
          actor,
          appointmentId,
          input.reason,
        );
        return this.getAppointmentDetail(actor, completed.id);
      }
      case "CANCELED":
        return this.cancelAppointment(actor, appointmentId, {
          reason: input.reason ?? "",
        });
      default:
        throw new BadRequestException("Unsupported appointment status action.");
    }
  }

  private async resolveDayContext(actor: AuthenticatedUser, rawDate?: string) {
    const tenantId = this.accessService.resolveActiveTenantId(actor);
    const timezone = await this.timezoneService.getTenantTimezone(tenantId);
    const currentInstant = await this.timezoneService.getCurrentInstant();
    const date =
      rawDate?.trim() ||
      this.timezoneService.getTenantDateKey(currentInstant, timezone);
    const dayContext = this.timezoneService.buildDayContext(date, timezone);

    return {
      tenantId,
      dayContext,
    };
  }

  private mapAgendaAppointment(
    appointment: ReceptionAppointmentRecord,
  ): ReceptionDashboardResponse["queue"][number] {
    const primaryContact = appointment.patient.contacts[0]?.value ?? null;

    return {
      id: appointment.id,
      status: appointment.status,
      startsAt: appointment.startsAt.toISOString(),
      endsAt: appointment.endsAt.toISOString(),
      room: appointment.room,
      unitId: appointment.unitId,
      unitName: appointment.unit?.name ?? null,
      professionalId: appointment.professionalId,
      professionalName: appointment.professional.displayName || appointment.professional.fullName,
      consultationTypeId: appointment.consultationTypeId,
      consultationTypeName: appointment.consultationType.name,
      patientId: appointment.patientId,
      patientName: appointment.patient.fullName,
      patientPrimaryContact: primaryContact,
      checkedInAt: appointment.checkedInAt ? appointment.checkedInAt.toISOString() : null,
      confirmedAt: appointment.confirmedAt ? appointment.confirmedAt.toISOString() : null,
      calledAt: appointment.calledAt ? appointment.calledAt.toISOString() : null,
      startedAt: appointment.startedAt ? appointment.startedAt.toISOString() : null,
      closureReadyAt: appointment.closureReadyAt
        ? appointment.closureReadyAt.toISOString()
        : null,
      awaitingPaymentAt: appointment.awaitingPaymentAt
        ? appointment.awaitingPaymentAt.toISOString()
        : null,
      completedAt: appointment.completedAt ? appointment.completedAt.toISOString() : null,
      cancellationReason: appointment.cancellationReason,
    };
  }

  private mapAppointmentDetail(
    appointment: ReceptionAppointmentRecord,
  ): ReceptionAppointmentDetail {
    return {
      ...this.mapAgendaAppointment(appointment),
      tenantId: appointment.tenantId,
      slotHoldId: appointment.slotHoldId,
      durationMinutes: appointment.durationMinutes,
      bufferBeforeMinutes: appointment.bufferBeforeMinutes,
      bufferAfterMinutes: appointment.bufferAfterMinutes,
      idempotencyKey: appointment.idempotencyKey,
      notes: appointment.notes,
      createdAt: appointment.createdAt.toISOString(),
      updatedAt: appointment.updatedAt.toISOString(),
      statusHistory: appointment.statusHistory.map((entry): ReceptionStatusHistoryEntry => ({
        id: entry.id,
        fromStatus: entry.fromStatus,
        toStatus: entry.toStatus,
        reason: entry.reason,
        metadata:
          entry.metadata && typeof entry.metadata === "object"
            ? (entry.metadata as Record<string, unknown>)
            : null,
        changedByUserId: entry.changedByUserId,
        createdAt: entry.createdAt.toISOString(),
      })),
      patient: {
        id: appointment.patient.id,
        fullName: appointment.patient.fullName,
        birthDate: appointment.patient.birthDate
          ? appointment.patient.birthDate.toISOString()
          : null,
        documentNumber: appointment.patient.documentNumber,
        notes: appointment.patient.notes,
        isActive: appointment.patient.isActive,
        contacts: appointment.patient.contacts.map((contact) => ({
          id: contact.id,
          type: contact.type,
          value: contact.value,
          normalizedValue: contact.normalizedValue,
          isPrimary: contact.isPrimary,
        })),
      },
    };
  }

  private parseStatusAction(
    value: string,
  ): ReceptionOperationalStatusAction {
    const normalized = value?.trim().toUpperCase();

    switch (normalized) {
      case "CONFIRMED":
      case "CHECKED_IN":
      case "NO_SHOW":
      case "COMPLETED":
      case "CANCELED":
        return normalized;
      default:
        throw new BadRequestException("Unsupported appointment status action.");
    }
  }
}
