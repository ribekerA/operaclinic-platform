import { ScheduleDayOfWeek } from "@prisma/client";

export class UpdateScheduleDto {
  professionalId?: string;
  dayOfWeek?: ScheduleDayOfWeek;
  startTime?: string;
  endTime?: string;
  slotIntervalMinutes?: number;
  unitId?: string;
  validFrom?: string;
  validTo?: string;
  isActive?: boolean;
}
