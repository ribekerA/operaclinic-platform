export interface ConsultationTypeResponse {
  id: string;
  tenantId: string;
  name: string;
  durationMinutes: number;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  isFirstVisit: boolean;
  isReturnVisit: boolean;
  isOnline: boolean;
  isActive: boolean;
  aestheticArea: string | null;
  invasivenessLevel: string | null;
  recoveryDays: number | null;
  recommendedFrequencyDays: number | null;
  preparationNotes: string | null;
  contraindications: string | null;
  aftercareGuidance: string | null;
  createdAt: Date;
  updatedAt: Date;
}
