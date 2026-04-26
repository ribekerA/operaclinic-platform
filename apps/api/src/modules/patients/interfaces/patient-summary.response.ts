import { PatientContactType } from "@prisma/client";

export interface PatientContactResponse {
  id: string;
  type: PatientContactType;
  value: string;
  normalizedValue: string;
  isPrimary: boolean;
}

export interface PatientProtocolInstanceSummaryResponse {
  id: string;
  procedureProtocolId: string;
  procedureProtocolName: string;
  consultationTypeId: string;
  consultationTypeName: string;
  status: string;
  sessionsPlanned: number;
  sessionsScheduled: number;
  sessionsCompleted: number;
  nextSessionDate: Date | null;
  expectedCompletionAt: Date | null;
  updatedAt: Date;
}

export interface PatientSummaryResponse {
  id: string;
  tenantId: string;
  fullName: string | null;
  birthDate: Date | null;
  documentNumber: string | null;
  notes: string | null;
  isActive: boolean;
  mergedIntoPatientId: string | null;
  mergedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  contacts: PatientContactResponse[];
  protocolInstances: PatientProtocolInstanceSummaryResponse[];
}
