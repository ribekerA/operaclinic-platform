import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PatientContactType, RoleCode, AppointmentStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AppointmentsService } from '../scheduling/appointments.service';
import { AvailabilityService } from '../scheduling/availability.service';
import { SchedulingTimezoneService } from '../scheduling/scheduling-timezone.service';
import type { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import type { AppointmentResponse } from '../scheduling/interfaces/appointment.response';
import { AgentApiException, AgentErrorCode } from './agent-api.errors';
import type { CreateAgentAppointmentDto } from './dto/create-agent-appointment.dto';
import type { GetAvailabilityDto } from './dto/get-availability.dto';
import type { RescheduleAgentAppointmentDto } from './dto/reschedule-agent-appointment.dto';
import type { CancelAgentAppointmentDto } from './dto/cancel-agent-appointment.dto';

const ACTIVE_STATUSES: AppointmentStatus[] = [
  AppointmentStatus.BOOKED,
  AppointmentStatus.CONFIRMED,
  AppointmentStatus.CHECKED_IN,
  AppointmentStatus.CALLED,
  AppointmentStatus.IN_PROGRESS,
  AppointmentStatus.AWAITING_CLOSURE,
  AppointmentStatus.AWAITING_PAYMENT,
];

function toConfirmationCode(id: string): string {
  return id.replace(/-/g, '').substring(0, 6).toUpperCase();
}

@Injectable()
export class AgentApiService {
  private readonly logger = new Logger(AgentApiService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly availabilityService: AvailabilityService,
    private readonly appointmentsService: AppointmentsService,
    private readonly timezoneService: SchedulingTimezoneService,
  ) {}

  async getAvailability(tenantId: string, query: GetAvailabilityDto) {
    const consultationType = await this.prisma.consultationType.findFirst({
      where: { id: query.service_id, tenantId, isActive: true },
      select: { id: true, name: true, durationMinutes: true },
    });
    if (!consultationType) {
      throw new AgentApiException(
        AgentErrorCode.SERVICE_NOT_FOUND,
        `Serviço não encontrado: ${query.service_id}.`,
        404,
      );
    }

    const from = new Date(`${query.date_from}T00:00:00Z`);
    const to = new Date(`${query.date_to}T00:00:00Z`);

    if (isNaN(from.getTime()) || isNaN(to.getTime()) || to < from) {
      throw new AgentApiException(
        AgentErrorCode.INVALID_DATE_RANGE,
        'date_to must be on or after date_from.',
      );
    }

    const days = Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1;
    if (days > 14) {
      throw new AgentApiException(
        AgentErrorCode.INVALID_DATE_RANGE,
        'Intervalo de datas não pode exceder 14 dias.',
      );
    }

    let professionals: Array<{ id: string; displayName: string; fullName: string }>;
    if (query.professional_id) {
      const prof = await this.prisma.professional.findFirst({
        where: { id: query.professional_id, tenantId, isActive: true },
        select: { id: true, displayName: true, fullName: true },
      });
      if (!prof) {
        throw new AgentApiException(
          AgentErrorCode.PROFESSIONAL_NOT_FOUND,
          `Profissional não encontrado: ${query.professional_id}.`,
          404,
        );
      }
      professionals = [prof];
    } else {
      professionals = await this.prisma.professional.findMany({
        where: { tenantId, isActive: true },
        select: { id: true, displayName: true, fullName: true },
      });
    }

    if (professionals.length === 0) return [];

    const actor = this.buildActor(tenantId);
    const slots: Array<{
      date: string;
      professional_id: string;
      professional_name: string;
      service_id: string;
      service_name: string;
      duration_minutes: number;
      starts_at: string;
      ends_at: string;
    }> = [];

    for (let d = 0; d < days; d++) {
      const day = new Date(from);
      day.setUTCDate(day.getUTCDate() + d);
      const dateKey = day.toISOString().split('T')[0];

      for (const professional of professionals) {
        try {
          const daySlots = await this.availabilityService.searchAvailability(actor, {
            professionalId: professional.id,
            consultationTypeId: consultationType.id,
            date: dateKey,
          });

          for (const slot of daySlots) {
            slots.push({
              date: dateKey,
              professional_id: professional.id,
              professional_name: professional.displayName || professional.fullName,
              service_id: consultationType.id,
              service_name: consultationType.name,
              duration_minutes: consultationType.durationMinutes,
              starts_at: slot.startsAt.toISOString(),
              ends_at: slot.endsAt.toISOString(),
            });
          }
        } catch (err) {
          // Professional has no schedule for this day — skip silently
          this.logger.debug(
            `No availability for professional ${professional.id} on ${dateKey}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    }

    return slots;
  }

  async createAppointment(tenantId: string, input: CreateAgentAppointmentDto) {
    const patientId = await this.findOrCreatePatient(
      tenantId,
      input.patient_name,
      input.patient_phone,
    );

    const normalizedPhone = input.patient_phone.replace(/\D/g, '');
    const startsAtNormalized = new Date(input.starts_at).toISOString();
    const idempotencyKey = `agent-${normalizedPhone}-${startsAtNormalized}`;
    const actor = this.buildActor(tenantId);

    try {
      const appointment = await this.appointmentsService.createAppointment(actor, {
        patientId,
        professionalId: input.professional_id,
        consultationTypeId: input.service_id,
        startsAt: input.starts_at,
        unitId: input.unit_id,
        notes: input.notes,
        idempotencyKey,
      });

      return this.mapAppointmentResponse(appointment, {
        patient_name: input.patient_name,
        patient_phone: input.patient_phone,
      });
    } catch (err) {
      if (err instanceof ConflictException) {
        const msg = this.extractMessage(err);
        throw new AgentApiException(
          AgentErrorCode.SLOT_TAKEN,
          `SLOT_TAKEN: ${msg} Consulte /availability novamente para obter horários disponíveis.`,
          409,
        );
      }
      if (err instanceof BadRequestException) {
        throw new AgentApiException(AgentErrorCode.SLOT_NOT_FOUND, this.extractMessage(err));
      }
      if (err instanceof NotFoundException) {
        throw new AgentApiException(
          AgentErrorCode.APPOINTMENT_NOT_FOUND,
          this.extractMessage(err),
          404,
        );
      }
      throw err;
    }
  }

  async rescheduleAppointment(
    tenantId: string,
    appointmentId: string,
    input: RescheduleAgentAppointmentDto,
  ) {
    await this.assertAppointmentBelongsToTenant(appointmentId, tenantId);
    const actor = this.buildActor(tenantId);

    try {
      const updated = await this.appointmentsService.rescheduleAppointment(
        actor,
        appointmentId,
        {
          startsAt: input.starts_at,
          reason: input.reason,
        },
      );
      return this.mapAppointmentResponse(updated);
    } catch (err) {
      if (err instanceof ConflictException) {
        const msg = this.extractMessage(err);
        throw new AgentApiException(
          AgentErrorCode.SLOT_TAKEN,
          `SLOT_TAKEN: ${msg} Consulte /availability para outros horários.`,
          409,
        );
      }
      if (err instanceof BadRequestException) {
        throw new AgentApiException(
          AgentErrorCode.APPOINTMENT_NOT_RESCHEDULABLE,
          this.extractMessage(err),
        );
      }
      throw err;
    }
  }

  async cancelAppointment(
    tenantId: string,
    appointmentId: string,
    input: CancelAgentAppointmentDto,
  ) {
    await this.assertAppointmentBelongsToTenant(appointmentId, tenantId);
    const actor = this.buildActor(tenantId);

    try {
      const canceled = await this.appointmentsService.cancelAppointment(actor, appointmentId, {
        reason: input.reason ?? 'Cancelado pelo paciente via assistente virtual.',
      });
      return this.mapAppointmentResponse(canceled);
    } catch (err) {
      if (err instanceof BadRequestException) {
        throw new AgentApiException(
          AgentErrorCode.APPOINTMENT_NOT_CANCELLABLE,
          this.extractMessage(err),
        );
      }
      throw err;
    }
  }

  async lookupAppointments(tenantId: string, phone: string) {
    const normalizedPhone = phone.replace(/\D/g, '');
    const now = new Date();

    const contacts = await this.prisma.patientContact.findMany({
      where: { tenantId, normalizedValue: normalizedPhone },
      select: { patientId: true },
    });

    if (contacts.length === 0) return [];

    const patientIds = [...new Set(contacts.map((c) => c.patientId))];

    const appointments = await this.prisma.appointment.findMany({
      where: {
        tenantId,
        patientId: { in: patientIds },
        startsAt: { gte: now },
        status: { in: ACTIVE_STATUSES },
      },
      include: {
        professional: { select: { id: true, fullName: true, displayName: true } },
        consultationType: { select: { id: true, name: true } },
        unit: { select: { id: true, name: true } },
      },
      orderBy: { startsAt: 'asc' },
      take: 10,
    });

    return appointments.map((appt) => ({
      id: appt.id,
      confirmation_code: toConfirmationCode(appt.id),
      professional_id: appt.professionalId,
      professional_name: appt.professional.displayName || appt.professional.fullName,
      service_id: appt.consultationTypeId,
      service_name: appt.consultationType.name,
      starts_at: appt.startsAt.toISOString(),
      ends_at: appt.endsAt.toISOString(),
      duration_minutes: appt.durationMinutes,
      status: appt.status,
      unit_id: appt.unitId ?? null,
      unit_name: appt.unit?.name ?? null,
    }));
  }

  private async findOrCreatePatient(
    tenantId: string,
    name: string,
    phone: string,
  ): Promise<string> {
    const normalizedPhone = phone.replace(/\D/g, '');

    const existing = await this.prisma.patientContact.findFirst({
      where: { tenantId, normalizedValue: normalizedPhone },
      select: { patientId: true },
    });

    if (existing) return existing.patientId;

    try {
      const created = await this.prisma.patient.create({
        data: {
          tenantId,
          fullName: name.trim(),
          isActive: true,
          contacts: {
            create: {
              tenantId,
              type: PatientContactType.WHATSAPP,
              value: phone,
              normalizedValue: normalizedPhone,
              isPrimary: true,
              allowAutomatedMessaging: true,
            },
          },
        },
        select: { id: true },
      });
      return created.id;
    } catch {
      // Race condition: retry lookup
      const retryLookup = await this.prisma.patientContact.findFirst({
        where: { tenantId, normalizedValue: normalizedPhone },
        select: { patientId: true },
      });
      if (retryLookup) return retryLookup.patientId;
      throw new AgentApiException(AgentErrorCode.INTERNAL_ERROR, 'Falha ao criar paciente.', 500);
    }
  }

  private async assertAppointmentBelongsToTenant(
    appointmentId: string,
    tenantId: string,
  ): Promise<void> {
    const appt = await this.prisma.appointment.findFirst({
      where: { id: appointmentId, tenantId },
      select: { id: true },
    });
    if (!appt) {
      throw new AgentApiException(
        AgentErrorCode.APPOINTMENT_NOT_FOUND,
        `Agendamento não encontrado: ${appointmentId}.`,
        404,
      );
    }
  }

  private buildActor(tenantId: string): AuthenticatedUser {
    return {
      id: 'agent-api-system',
      email: 'agent-api@system.operaclinic',
      profile: 'clinic',
      roles: [RoleCode.RECEPTION],
      tenantIds: [tenantId],
      activeTenantId: tenantId,
    };
  }

  private mapAppointmentResponse(
    appointment: AppointmentResponse,
    extra?: { patient_name?: string; patient_phone?: string },
  ) {
    return {
      id: appointment.id,
      confirmation_code: toConfirmationCode(appointment.id),
      professional_id: appointment.professionalId,
      professional_name: appointment.professional.displayName || appointment.professional.fullName,
      service_id: appointment.consultationTypeId,
      service_name: appointment.consultationType.name,
      starts_at: appointment.startsAt instanceof Date
        ? appointment.startsAt.toISOString()
        : appointment.startsAt,
      ends_at: appointment.endsAt instanceof Date
        ? appointment.endsAt.toISOString()
        : appointment.endsAt,
      duration_minutes: appointment.durationMinutes,
      status: appointment.status,
      unit_id: appointment.unitId ?? null,
      unit_name: appointment.unit?.name ?? null,
      ...(extra?.patient_name ? { patient_name: extra.patient_name } : {}),
      ...(extra?.patient_phone ? { patient_phone: extra.patient_phone } : {}),
    };
  }

  private extractMessage(err: { getResponse(): unknown }): string {
    const res = err.getResponse();
    if (typeof res === 'string') return res;
    const cast = res as { message?: string | string[] };
    if (Array.isArray(cast.message)) return cast.message.join('; ');
    return String(cast.message ?? res);
  }
}
