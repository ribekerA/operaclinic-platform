export interface AvailabilitySlotResponse {
  startsAt: Date;
  endsAt: Date;
  occupancyStartsAt: Date;
  occupancyEndsAt: Date;
  professionalId: string;
  unitId: string | null;
}
