export interface ScheduleBlockResponse {
  id: string;
  tenantId: string;
  professionalId: string;
  unitId: string | null;
  room: string | null;
  reason: string | null;
  startsAt: Date;
  endsAt: Date;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}
