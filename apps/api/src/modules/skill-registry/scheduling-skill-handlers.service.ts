import type {
  CancelAppointmentSkillInput,
  ConfirmAppointmentSkillInput,
  CreateAppointmentSkillInput,
  HoldSlotSkillInput,
  ReceptionAvailabilitySlot,
  RescheduleAppointmentSkillInput,
  SkillAppointmentPayload,
  SkillSlotHoldPayload,
} from "@operaclinic/shared";
import { Injectable } from "@nestjs/common";
import { AuthenticatedUser } from "../../auth/interfaces/authenticated-user.interface";
import { AppointmentsService } from "../scheduling/appointments.service";
import { AvailabilityService } from "../scheduling/availability.service";
import { AppointmentResponse } from "../scheduling/interfaces/appointment.response";
import { SlotHoldResponse } from "../scheduling/interfaces/slot-hold.response";

@Injectable()
export class SchedulingSkillHandlersService {
  constructor(
    private readonly availabilityService: AvailabilityService,
    private readonly appointmentsService: AppointmentsService,
  ) {}

  async searchAvailability(
    actor: AuthenticatedUser,
    input: {
      professionalId: string;
      consultationTypeId: string;
      date: string;
      unitId?: string;
    },
  ): Promise<ReceptionAvailabilitySlot[]> {
    const slots = await this.availabilityService.searchAvailability(actor, input);

    return slots.map((slot) => ({
      startsAt: slot.startsAt.toISOString(),
      endsAt: slot.endsAt.toISOString(),
      occupancyStartsAt: slot.occupancyStartsAt.toISOString(),
      occupancyEndsAt: slot.occupancyEndsAt.toISOString(),
      professionalId: slot.professionalId,
      unitId: slot.unitId,
    }));
  }

  async holdSlot(
    actor: AuthenticatedUser,
    input: HoldSlotSkillInput,
  ): Promise<SkillSlotHoldPayload> {
    const hold = await this.availabilityService.createSlotHold(actor, input);
    return this.mapSlotHold(hold);
  }

  async createAppointment(
    actor: AuthenticatedUser,
    input: CreateAppointmentSkillInput,
  ): Promise<SkillAppointmentPayload> {
    const appointment = await this.appointmentsService.createAppointment(actor, input);
    return this.mapAppointment(appointment);
  }

  async confirmAppointment(
    actor: AuthenticatedUser,
    input: ConfirmAppointmentSkillInput,
  ): Promise<SkillAppointmentPayload> {
    const appointment = await this.appointmentsService.confirmAppointment(
      actor,
      input.appointmentId,
      input.reason,
    );

    return this.mapAppointment(appointment);
  }

  async rescheduleAppointment(
    actor: AuthenticatedUser,
    input: RescheduleAppointmentSkillInput,
  ): Promise<SkillAppointmentPayload> {
    const appointment = await this.appointmentsService.rescheduleAppointment(
      actor,
      input.appointmentId,
      {
        startsAt: input.startsAt,
        unitId: input.unitId,
        room: input.room,
        reason: input.reason,
      },
    );

    return this.mapAppointment(appointment);
  }

  async cancelAppointment(
    actor: AuthenticatedUser,
    input: CancelAppointmentSkillInput,
  ): Promise<SkillAppointmentPayload> {
    const appointment = await this.appointmentsService.cancelAppointment(
      actor,
      input.appointmentId,
      {
        reason: input.reason,
      },
    );

    return this.mapAppointment(appointment);
  }

  private mapSlotHold(hold: SlotHoldResponse): SkillSlotHoldPayload {
    return {
      id: hold.id,
      tenantId: hold.tenantId,
      patientId: hold.patientId,
      professionalId: hold.professionalId,
      consultationTypeId: hold.consultationTypeId,
      unitId: hold.unitId,
      room: hold.room,
      startsAt: hold.startsAt.toISOString(),
      endsAt: hold.endsAt.toISOString(),
      status: hold.status,
      expiresAt: hold.expiresAt.toISOString(),
      createdByUserId: hold.createdByUserId,
      createdAt: hold.createdAt.toISOString(),
      updatedAt: hold.updatedAt.toISOString(),
    };
  }

  private mapAppointment(appointment: AppointmentResponse): SkillAppointmentPayload {
    return {
      id: appointment.id,
      tenantId: appointment.tenantId,
      patientId: appointment.patientId,
      professionalId: appointment.professionalId,
      consultationTypeId: appointment.consultationTypeId,
      unitId: appointment.unitId,
      slotHoldId: appointment.slotHoldId,
      room: appointment.room,
      startsAt: appointment.startsAt.toISOString(),
      endsAt: appointment.endsAt.toISOString(),
      durationMinutes: appointment.durationMinutes,
      bufferBeforeMinutes: appointment.bufferBeforeMinutes,
      bufferAfterMinutes: appointment.bufferAfterMinutes,
      status: appointment.status,
      confirmedAt: appointment.confirmedAt?.toISOString() ?? null,
      checkedInAt: appointment.checkedInAt?.toISOString() ?? null,
      noShowAt: appointment.noShowAt?.toISOString() ?? null,
      idempotencyKey: appointment.idempotencyKey,
      cancellationReason: appointment.cancellationReason,
      notes: appointment.notes,
      createdByUserId: appointment.createdByUserId,
      updatedByUserId: appointment.updatedByUserId,
      createdAt: appointment.createdAt.toISOString(),
      updatedAt: appointment.updatedAt.toISOString(),
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
}
