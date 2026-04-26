import {
  AppointmentStatus,
  Prisma,
  UserStatus,
} from "@prisma/client";
import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type {
  ProfessionalLinkedUserSummary,
  ProfessionalWorkspaceAgendaItem,
  ProfessionalWorkspaceDashboardResponse,
  ProfessionalWorkspacePatientSummaryResponse,
} from "@operaclinic/shared";
import { AuthenticatedUser } from "../../auth/interfaces/authenticated-user.interface";
import { PrismaService } from "../../database/prisma.service";
import { AppointmentsService } from "../scheduling/appointments.service";
import { ProfessionalAppointmentNotesDto } from "./dto/professional-appointment-notes.dto";
import { SchedulingAccessService } from "../scheduling/scheduling-access.service";
import { SchedulingTimezoneService } from "../scheduling/scheduling-timezone.service";
import { ProfessionalStatusActionDto } from "./dto/professional-status-action.dto";

const professionalInclude = {
  user: {
    select: {
      id: true,
      email: true,
      fullName: true,
      status: true,
    },
  },
  professionalSpecialties: {
    include: {
      specialty: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  },
  professionalUnits: {
    include: {
      unit: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  },
} satisfies Prisma.ProfessionalInclude;

const appointmentInclude = {
  patient: {
    select: {
      id: true,
      fullName: true,
      birthDate: true,
      contacts: {
        where: {
          isPrimary: true,
        },
        orderBy: {
          createdAt: "asc",
        },
        select: {
          value: true,
        },
        take: 1,
      },
    },
  },
  consultationType: {
    select: {
      name: true,
    },
  },
  unit: {
    select: {
      name: true,
    },
  },
} satisfies Prisma.AppointmentInclude;

type ProfessionalRecord = Prisma.ProfessionalGetPayload<{
  include: typeof professionalInclude;
}>;

type AppointmentRecord = Prisma.AppointmentGetPayload<{
  include: typeof appointmentInclude;
}>;

interface HistoricalClinicalContextEntry {
  startsAt: string;
  intercurrenceSummary: string | null;
  preparationSummary: string | null;
  guidanceSummary: string | null;
}

const ACTIVE_APPOINTMENT_STATUSES: AppointmentStatus[] = [
  AppointmentStatus.BOOKED,
  AppointmentStatus.CONFIRMED,
  AppointmentStatus.CHECKED_IN,
  AppointmentStatus.CALLED,
  AppointmentStatus.IN_PROGRESS,
  AppointmentStatus.AWAITING_CLOSURE,
  AppointmentStatus.RESCHEDULED,
];

const UPCOMING_APPOINTMENT_STATUSES: AppointmentStatus[] = [
  AppointmentStatus.BOOKED,
  AppointmentStatus.CONFIRMED,
  AppointmentStatus.RESCHEDULED,
];

@Injectable()
export class ProfessionalWorkspaceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accessService: SchedulingAccessService,
    private readonly timezoneService: SchedulingTimezoneService,
    private readonly appointmentsService: AppointmentsService,
  ) {}

  async getDashboard(
    actor: AuthenticatedUser,
  ): Promise<ProfessionalWorkspaceDashboardResponse> {
    const { tenantId, professionalId } = this.resolveProfessionalContext(actor);

    const [currentInstant, timezone] = await Promise.all([
      this.timezoneService.getCurrentInstant(),
      this.timezoneService.getTenantTimezone(tenantId),
    ]);
    const currentDate = this.timezoneService.getTenantDateKey(
      currentInstant,
      timezone,
    );
    const dayContext = this.timezoneService.buildDayContext(currentDate, timezone);
    const nextWeekEnd = new Date(
      dayContext.dayEndUtcExclusive.getTime() + 7 * 86400000,
    );

    const [
      clinic,
      professional,
      todayAppointments,
      nextAppointment,
      upcomingAgenda,
      pendingConfirmation,
    ] = await Promise.all([
      this.prisma.clinic.findUnique({
        where: { tenantId },
        select: { displayName: true },
      }),
      this.prisma.professional.findFirst({
        where: {
          id: professionalId,
          tenantId,
        },
        include: professionalInclude,
      }),
      this.prisma.appointment.findMany({
        where: {
          tenantId,
          professionalId,
          startsAt: {
            gte: dayContext.dayStartUtc,
            lt: dayContext.dayEndUtcExclusive,
          },
        },
        orderBy: { startsAt: "asc" },
        include: appointmentInclude,
      }),
      this.prisma.appointment.findFirst({
        where: {
          tenantId,
          professionalId,
          startsAt: {
            gte: currentInstant,
          },
          status: {
            in: UPCOMING_APPOINTMENT_STATUSES,
          },
        },
        orderBy: { startsAt: "asc" },
        include: appointmentInclude,
      }),
      this.prisma.appointment.findMany({
        where: {
          tenantId,
          professionalId,
          startsAt: {
            gte: dayContext.dayEndUtcExclusive,
            lt: nextWeekEnd,
          },
          status: {
            in: ACTIVE_APPOINTMENT_STATUSES,
          },
        },
        orderBy: { startsAt: "asc" },
        take: 8,
        include: appointmentInclude,
      }),
      this.prisma.appointment.count({
        where: {
          tenantId,
          professionalId,
          startsAt: {
            gte: currentInstant,
          },
          status: {
            in: [AppointmentStatus.BOOKED, AppointmentStatus.RESCHEDULED],
          },
        },
      }),
    ]);

    if (!professional) {
      throw new NotFoundException(
        "Linked professional profile was not found for the active clinic.",
      );
    }

    const calledPatient = [...todayAppointments]
      .filter((appointment) => appointment.status === AppointmentStatus.CALLED)
      .sort((left, right) => {
        const leftReference =
          left.calledAt ?? left.checkedInAt ?? left.startsAt;
        const rightReference =
          right.calledAt ?? right.checkedInAt ?? right.startsAt;

        return leftReference.getTime() - rightReference.getTime();
      })[0] ?? null;

    const currentAppointment = [...todayAppointments]
      .filter((appointment) => appointment.status === AppointmentStatus.IN_PROGRESS)
      .sort((left, right) => {
        const leftReference = left.startedAt ?? left.checkedInAt ?? left.startsAt;
        const rightReference = right.startedAt ?? right.checkedInAt ?? right.startsAt;

        return leftReference.getTime() - rightReference.getTime();
      })[0] ?? null;

    const closingAppointment = [...todayAppointments]
      .filter(
        (appointment) =>
          appointment.status === AppointmentStatus.AWAITING_CLOSURE,
      )
      .sort((left, right) => {
        const leftReference =
          left.closureReadyAt ?? left.startedAt ?? left.checkedInAt ?? left.startsAt;
        const rightReference =
          right.closureReadyAt ?? right.startedAt ?? right.checkedInAt ?? right.startsAt;

        return leftReference.getTime() - rightReference.getTime();
      })[0] ?? null;

    const waitingPatient = [...todayAppointments]
      .filter((appointment) => appointment.status === AppointmentStatus.CHECKED_IN)
      .sort((left, right) => {
        const leftReference = left.checkedInAt ?? left.startsAt;
        const rightReference = right.checkedInAt ?? right.startsAt;

        return leftReference.getTime() - rightReference.getTime();
      })[0] ?? null;

    const historicalClinicalContextByPatient = await this.buildHistoricalClinicalContextMap(
      tenantId,
      Array.from(
        new Set(
          [
            ...todayAppointments,
            ...upcomingAgenda,
            ...(calledPatient ? [calledPatient] : []),
            ...(currentAppointment ? [currentAppointment] : []),
            ...(closingAppointment ? [closingAppointment] : []),
            ...(waitingPatient ? [waitingPatient] : []),
            ...(nextAppointment ? [nextAppointment] : []),
          ].map((appointment) => appointment.patientId),
        ),
      ),
      currentInstant,
    );

    const mappedCalledPatient = calledPatient
      ? this.mapAgendaItem(calledPatient, historicalClinicalContextByPatient)
      : null;
    const mappedCurrentAppointment = currentAppointment
      ? this.mapAgendaItem(currentAppointment, historicalClinicalContextByPatient)
      : null;
    const mappedClosingAppointment = closingAppointment
      ? this.mapAgendaItem(closingAppointment, historicalClinicalContextByPatient)
      : null;
    const mappedWaitingPatient = waitingPatient
      ? this.mapAgendaItem(waitingPatient, historicalClinicalContextByPatient)
      : null;
    const mappedNextAppointment =
      nextAppointment &&
      nextAppointment.id !== waitingPatient?.id &&
      nextAppointment.id !== calledPatient?.id &&
      nextAppointment.id !== currentAppointment?.id &&
      nextAppointment.id !== closingAppointment?.id
        ? this.mapAgendaItem(nextAppointment, historicalClinicalContextByPatient)
        : null;

    return {
      generatedAt: currentInstant.toISOString(),
      timezone,
      date: currentDate,
      clinicDisplayName: clinic?.displayName ?? null,
      professional: {
        id: professional.id,
        fullName: professional.fullName,
        displayName: professional.displayName,
        credential: professional.professionalRegister,
        linkedUser: professional.user
          ? this.mapLinkedUser(professional.user)
          : null,
        specialties: professional.professionalSpecialties.map((assignment) => ({
          id: assignment.specialty.id,
          name: assignment.specialty.name,
        })),
        units: professional.professionalUnits.map((assignment) => ({
          id: assignment.unit.id,
          name: assignment.unit.name,
        })),
      },
      summary: {
        appointmentsToday: todayAppointments.length,
        remainingToday: todayAppointments.filter(
          (appointment) =>
            ACTIVE_APPOINTMENT_STATUSES.includes(appointment.status) &&
            appointment.endsAt.getTime() > currentInstant.getTime(),
        ).length,
        checkedInWaiting: todayAppointments.filter(
          (appointment) => appointment.status === AppointmentStatus.CHECKED_IN,
        ).length,
        calledToRoom: todayAppointments.filter(
          (appointment) => appointment.status === AppointmentStatus.CALLED,
        ).length,
        inProgress: todayAppointments.filter(
          (appointment) => appointment.status === AppointmentStatus.IN_PROGRESS,
        ).length,
        awaitingClosure: todayAppointments.filter(
          (appointment) =>
            appointment.status === AppointmentStatus.AWAITING_CLOSURE,
        ).length,
        sentToReception: todayAppointments.filter(
          (appointment) =>
            appointment.status === AppointmentStatus.AWAITING_PAYMENT,
        ).length,
        completedToday: todayAppointments.filter(
          (appointment) =>
            appointment.status === AppointmentStatus.AWAITING_PAYMENT ||
            appointment.status === AppointmentStatus.COMPLETED,
        ).length,
        pendingConfirmation,
      },
      focus: {
        calledPatient: mappedCalledPatient,
        currentAppointment: mappedCurrentAppointment,
        closingAppointment: mappedClosingAppointment,
        waitingPatient: mappedWaitingPatient,
        nextAppointment: mappedNextAppointment,
      },
      recentCompleted: todayAppointments
        .filter(
          (appointment) =>
            appointment.status === AppointmentStatus.AWAITING_PAYMENT ||
            appointment.status === AppointmentStatus.COMPLETED,
        )
        .sort((left, right) => {
          const leftReference =
            left.completedAt ?? left.awaitingPaymentAt ?? left.startsAt;
          const rightReference =
            right.completedAt ?? right.awaitingPaymentAt ?? right.startsAt;
          return rightReference.getTime() - leftReference.getTime();
        })
        .slice(0, 4)
        .map((appointment) =>
          this.mapAgendaItem(appointment, historicalClinicalContextByPatient),
        ),
      todayAgenda: todayAppointments.map((appointment) =>
        this.mapAgendaItem(appointment, historicalClinicalContextByPatient),
      ),
      upcomingAgenda: upcomingAgenda.map((appointment) =>
        this.mapAgendaItem(appointment, historicalClinicalContextByPatient),
      ),
    };
  }

  async updateAppointmentStatus(
    actor: AuthenticatedUser,
    appointmentId: string,
    input: ProfessionalStatusActionDto,
  ): Promise<ProfessionalWorkspaceDashboardResponse> {
    const { tenantId, professionalId } = this.resolveProfessionalContext(actor);

    const ownedAppointment = await this.prisma.appointment.findFirst({
      where: {
        id: appointmentId,
        tenantId,
        professionalId,
      },
      select: {
        id: true,
      },
    });

    if (!ownedAppointment) {
      throw new NotFoundException(
        "Appointment was not found for the linked professional profile.",
      );
    }

    switch (input.status) {
      case "CALLED":
        await this.appointmentsService.callAppointment(
          actor,
          appointmentId,
          input.reason,
        );
        break;
      case "IN_PROGRESS":
        await this.appointmentsService.startAppointment(
          actor,
          appointmentId,
          input.reason,
        );
        break;
      case "AWAITING_CLOSURE":
        await this.appointmentsService.prepareAppointmentClosure(
          actor,
          appointmentId,
          input.reason,
        );
        break;
      case "AWAITING_PAYMENT":
        await this.appointmentsService.completeAppointment(
          actor,
          appointmentId,
          input.reason,
        );
        break;
      case "COMPLETED":
        await this.appointmentsService.completeAppointment(
          actor,
          appointmentId,
          input.reason,
        );
        break;
      case "NO_SHOW":
        await this.appointmentsService.markAppointmentAsNoShow(
          actor,
          appointmentId,
          input.reason,
        );
        break;
      default:
        throw new ForbiddenException("Unsupported professional appointment action.");
    }

    return this.getDashboard(actor);
  }

  async updateAppointmentNotes(
    actor: AuthenticatedUser,
    appointmentId: string,
    input: ProfessionalAppointmentNotesDto,
  ): Promise<ProfessionalWorkspaceDashboardResponse> {
    await this.assertAppointmentOwnership(actor, appointmentId);
    await this.appointmentsService.updateAppointmentNotes(
      actor,
      appointmentId,
      input.notes,
    );
    return this.getDashboard(actor);
  }

  async getPatientSummary(
    actor: AuthenticatedUser,
    patientId: string,
  ): Promise<ProfessionalWorkspacePatientSummaryResponse> {
    const { tenantId, professionalId } = this.resolveProfessionalContext(actor);
    const normalizedPatientId = patientId.trim();

    const relationship = await this.prisma.appointment.count({
      where: {
        tenantId,
        professionalId,
        patientId: normalizedPatientId,
      },
    });

    if (!relationship) {
      throw new NotFoundException(
        "Patient was not found for the linked professional profile.",
      );
    }

    const [patient, recentAppointments, aggregate] = await Promise.all([
      this.prisma.patient.findFirst({
        where: {
          id: normalizedPatientId,
          tenantId,
        },
        select: {
          id: true,
          fullName: true,
          birthDate: true,
          documentNumber: true,
          notes: true,
          isActive: true,
          contacts: {
            orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
            select: {
              type: true,
              value: true,
              isPrimary: true,
            },
          },
        },
      }),
      this.prisma.appointment.findMany({
        where: {
          tenantId,
          patientId: normalizedPatientId,
        },
        orderBy: {
          startsAt: "desc",
        },
        take: 6,
        include: {
          consultationType: {
            select: {
              name: true,
            },
          },
          professional: {
            select: {
              fullName: true,
              displayName: true,
            },
          },
          unit: {
            select: {
              name: true,
            },
          },
        },
      }),
      this.prisma.appointment.findMany({
        where: {
          tenantId,
          patientId: normalizedPatientId,
        },
        select: {
          startsAt: true,
          professionalId: true,
        },
        orderBy: {
          startsAt: "desc",
        },
      }),
    ]);

    if (!patient) {
      throw new NotFoundException("Patient was not found in the active clinic.");
    }

    const currentInstant = await this.timezoneService.getCurrentInstant();
    const appointmentsWithProfessional = aggregate.filter(
      (item) => item.professionalId === professionalId,
    ).length;
    const lastSeen = aggregate.find(
      (item) => item.startsAt.getTime() <= currentInstant.getTime(),
    );
    const nextAppointment = [...aggregate]
      .reverse()
      .find((item) => item.startsAt.getTime() > currentInstant.getTime());

    const lastClinicalContext = this.resolveLatestClinicalContext(
      recentAppointments.map((appointment) => ({
        startsAt: appointment.startsAt.toISOString(),
        notes: appointment.notes ?? null,
      })),
    );

    return {
      patient: {
        id: patient.id,
        fullName: patient.fullName,
        birthDate: patient.birthDate?.toISOString() ?? null,
        documentNumber: patient.documentNumber,
        notes: patient.notes,
        isActive: patient.isActive,
        contacts: patient.contacts.map((contact) => ({
          type: contact.type,
          value: contact.value,
          isPrimary: contact.isPrimary,
        })),
      },
      relationship: {
        appointmentsWithProfessional,
        lastSeenAt: lastSeen?.startsAt.toISOString() ?? null,
        nextAppointmentAt: nextAppointment?.startsAt.toISOString() ?? null,
      },
      alerts: {
        hasHistoricalIntercurrence: Boolean(lastClinicalContext?.intercurrenceSummary),
        lastIntercurrenceAt: lastClinicalContext?.startsAt ?? null,
        lastIntercurrenceSummary: lastClinicalContext?.intercurrenceSummary ?? null,
        lastPreparationSummary: lastClinicalContext?.preparationSummary ?? null,
        lastGuidanceSummary: lastClinicalContext?.guidanceSummary ?? null,
      },
      recentAppointments: recentAppointments.map((appointment) => ({
        id: appointment.id,
        startsAt: appointment.startsAt.toISOString(),
        endsAt: appointment.endsAt.toISOString(),
        status: appointment.status,
        consultationTypeName: appointment.consultationType.name,
        professionalName:
          appointment.professional.displayName || appointment.professional.fullName,
        unitName: appointment.unit?.name ?? null,
        room: appointment.room ?? null,
        notes: appointment.notes ?? null,
      })),
    };
  }

  private mapAgendaItem(
    appointment: AppointmentRecord,
    historicalClinicalContextByPatient?: Map<string, HistoricalClinicalContextEntry>,
  ): ProfessionalWorkspaceAgendaItem {
    const clinicalContext = historicalClinicalContextByPatient?.get(appointment.patientId);

    return {
      id: appointment.id,
      status: appointment.status,
      startsAt: appointment.startsAt.toISOString(),
      endsAt: appointment.endsAt.toISOString(),
      room: appointment.room ?? null,
      unitName: appointment.unit?.name ?? null,
      consultationTypeName: appointment.consultationType.name,
      patientId: appointment.patient.id,
      patientName: appointment.patient.fullName ?? null,
      patientBirthDate: appointment.patient.birthDate?.toISOString() ?? null,
      patientPrimaryContact: appointment.patient.contacts[0]?.value ?? null,
      confirmedAt: appointment.confirmedAt?.toISOString() ?? null,
      checkedInAt: appointment.checkedInAt?.toISOString() ?? null,
      calledAt: appointment.calledAt?.toISOString() ?? null,
      startedAt: appointment.startedAt?.toISOString() ?? null,
      closureReadyAt: appointment.closureReadyAt?.toISOString() ?? null,
      awaitingPaymentAt: appointment.awaitingPaymentAt?.toISOString() ?? null,
      completedAt: appointment.completedAt?.toISOString() ?? null,
      notes: appointment.notes ?? null,
      hasHistoricalIntercurrence: Boolean(clinicalContext?.intercurrenceSummary),
      lastIntercurrenceAt: clinicalContext?.startsAt ?? null,
      lastIntercurrenceSummary: clinicalContext?.intercurrenceSummary ?? null,
      lastPreparationSummary: clinicalContext?.preparationSummary ?? null,
      lastGuidanceSummary: clinicalContext?.guidanceSummary ?? null,
    };
  }

  private mapLinkedUser(user: {
    id: string;
    email: string;
    fullName: string;
    status: UserStatus;
  }): ProfessionalLinkedUserSummary {
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      status: user.status,
    };
  }

  private resolveProfessionalContext(
    actor: AuthenticatedUser,
  ): { tenantId: string; professionalId: string } {
    const tenantId = this.accessService.resolveActiveTenantId(actor);
    const professionalId = actor.linkedProfessionalId?.trim();

    if (!professionalId) {
      throw new ForbiddenException(
        "Current session is not linked to a professional profile.",
      );
    }

    return {
      tenantId,
      professionalId,
    };
  }

  private async assertAppointmentOwnership(
    actor: AuthenticatedUser,
    appointmentId: string,
  ): Promise<void> {
    const { tenantId, professionalId } = this.resolveProfessionalContext(actor);

    const ownedAppointment = await this.prisma.appointment.findFirst({
      where: {
        id: appointmentId,
        tenantId,
        professionalId,
      },
      select: {
        id: true,
      },
    });

    if (!ownedAppointment) {
      throw new NotFoundException(
        "Appointment was not found for the linked professional profile.",
      );
    }
  }

  private async buildHistoricalClinicalContextMap(
    tenantId: string,
    patientIds: string[],
    currentInstant: Date,
  ): Promise<Map<string, HistoricalClinicalContextEntry>> {
    const normalizedPatientIds = Array.from(new Set(patientIds.filter(Boolean)));

    if (!normalizedPatientIds.length) {
      return new Map();
    }

    const appointments = await this.prisma.appointment.findMany({
      where: {
        tenantId,
        patientId: {
          in: normalizedPatientIds,
        },
        startsAt: {
          lt: currentInstant,
        },
        notes: {
          not: null,
        },
      },
      select: {
        patientId: true,
        startsAt: true,
        notes: true,
      },
      orderBy: {
        startsAt: "desc",
      },
    });

    const result = new Map<string, HistoricalClinicalContextEntry>();

    for (const appointment of appointments) {
      if (result.has(appointment.patientId)) {
        continue;
      }

      const intercurrenceSummary = this.extractSectionSummary(
        appointment.notes,
        "Intercorrencia",
      );
      const preparationSummary = this.extractSectionSummary(
        appointment.notes,
        "Preparacao/pele",
      );
      const guidanceSummary = this.extractSectionSummary(
        appointment.notes,
        "Orientacao final",
      );

      if (!intercurrenceSummary && !preparationSummary && !guidanceSummary) {
        continue;
      }

      result.set(appointment.patientId, {
        startsAt: appointment.startsAt.toISOString(),
        intercurrenceSummary,
        preparationSummary,
        guidanceSummary,
      });
    }

    return result;
  }

  private resolveLatestClinicalContext(
    appointments: Array<{ startsAt: string; notes: string | null }>,
  ): HistoricalClinicalContextEntry | null {
    for (const appointment of appointments) {
      const intercurrenceSummary = this.extractSectionSummary(
        appointment.notes,
        "Intercorrencia",
      );
      const preparationSummary = this.extractSectionSummary(
        appointment.notes,
        "Preparacao/pele",
      );
      const guidanceSummary = this.extractSectionSummary(
        appointment.notes,
        "Orientacao final",
      );

      if (intercurrenceSummary || preparationSummary || guidanceSummary) {
        return {
          startsAt: appointment.startsAt,
          intercurrenceSummary,
          preparationSummary,
          guidanceSummary,
        };
      }
    }

    return null;
  }

  private extractSectionSummary(
    notes: string | null,
    sectionLabel: string,
  ): string | null {
    const normalized = notes?.trim();

    if (!normalized) {
      return null;
    }

    const marker = `${sectionLabel}:\n`;
    const startIndex = normalized.indexOf(marker);

    if (startIndex < 0) {
      return null;
    }

    const remainder = normalized.slice(startIndex + marker.length);
    const nextSectionIndex = remainder.indexOf("\n\n");
    const summary =
      nextSectionIndex >= 0 ? remainder.slice(0, nextSectionIndex) : remainder;
    const trimmed = summary.trim();

    return trimmed || null;
  }
}
