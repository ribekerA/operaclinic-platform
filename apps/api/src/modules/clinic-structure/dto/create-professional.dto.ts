export class CreateProfessionalDto {
  fullName!: string;
  displayName!: string;
  professionalRegister!: string;
  accessEmail!: string;
  accessPassword!: string;
  visibleForSelfBooking?: boolean;
  isActive?: boolean;
  specialtyIds?: string[];
  unitIds?: string[];
}
