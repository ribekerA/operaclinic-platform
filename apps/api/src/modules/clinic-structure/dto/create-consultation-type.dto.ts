export class CreateConsultationTypeDto {
  name!: string;
  durationMinutes!: number;
  bufferBeforeMinutes?: number;
  bufferAfterMinutes?: number;
  isFirstVisit?: boolean;
  isReturnVisit?: boolean;
  isOnline?: boolean;
  isActive?: boolean;
  aestheticArea?:
    | "FACIAL"
    | "CORPORAL"
    | "CAPILAR"
    | "LASER"
    | "HARMONIZACAO_OROFACIAL"
    | "PEELING"
    | "OUTRO";
  invasivenessLevel?:
    | "NON_INVASIVE"
    | "MINIMALLY_INVASIVE"
    | "MODERATELY_INVASIVE"
    | "HIGHLY_INVASIVE"
    | "SURGICAL";
  recoveryDays?: number;
  recommendedFrequencyDays?: number;
  preparationNotes?: string | null;
  contraindications?: string | null;
  aftercareGuidance?: string | null;
}
