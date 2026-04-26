export class CreateAppointmentDto {
  patientId!: string;
  professionalId!: string;
  consultationTypeId!: string;
  unitId?: string;
  slotHoldId?: string;
  room?: string;
  startsAt!: string;
  notes?: string;
  idempotencyKey!: string;
}
