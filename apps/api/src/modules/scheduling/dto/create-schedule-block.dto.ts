export class CreateScheduleBlockDto {
  professionalId!: string;
  unitId?: string;
  room?: string;
  reason?: string;
  startsAt!: string;
  endsAt!: string;
  isActive?: boolean;
}
