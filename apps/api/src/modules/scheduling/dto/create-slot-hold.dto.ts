export class CreateSlotHoldDto {
  patientId?: string;
  professionalId!: string;
  consultationTypeId!: string;
  unitId?: string;
  room?: string;
  startsAt!: string;
  ttlMinutes?: number;
}
