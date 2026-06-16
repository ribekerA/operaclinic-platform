export class RescheduleAppointmentDto {
  startsAt!: string;
  unitId?: string;
  room?: string;
  reason?: string;
  scheduleOverride?: boolean;
}
