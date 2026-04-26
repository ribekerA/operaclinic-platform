export interface ProcedureProtocolResponse {
  id: string;
  tenantId: string;
  consultationTypeId: string;
  consultationTypeName: string;
  name: string;
  description: string | null;
  totalSessions: number;
  intervalBetweenSessionsDays: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}
