import { ScheduleDayOfWeek } from "@prisma/client";

export interface ScheduleResponse {
  id: string;
  tenantId: string;
  professionalId: string;
  unitId: string | null;
  dayOfWeek: ScheduleDayOfWeek;
  startTime: string;
  endTime: string;
  slotIntervalMinutes: number;
  isActive: boolean;
  validFrom: Date | null;
  validTo: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
