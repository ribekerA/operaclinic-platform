import { SlotHoldStatus } from "@prisma/client";

export interface SlotHoldResponse {
  id: string;
  tenantId: string;
  patientId: string | null;
  professionalId: string;
  consultationTypeId: string;
  unitId: string | null;
  room: string | null;
  startsAt: Date;
  endsAt: Date;
  status: SlotHoldStatus;
  expiresAt: Date;
  createdByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}
