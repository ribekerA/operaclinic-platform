import { ScheduleDayOfWeek } from "@prisma/client";

export class CreateScheduleDto {
  professionalId!: string;
  dayOfWeek!: ScheduleDayOfWeek;
  startTime!: string;
  endTime!: string;
  slotIntervalMinutes?: number;
  unitId?: string;
  validFrom?: string;
  validTo?: string;
  isActive?: boolean;
}
