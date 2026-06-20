export type CommercialPlanCode = "ESTETICA_START" | "ESTETICA_FLOW" | "ESTETICA_SCALE";

export interface PlanLimits {
  maxProfessionals: number | null; // null = sem limite
  maxUnits: number | null;
}

export interface PlanFeatureSet {
  limits: PlanLimits;
  // Operação core
  receptionAndSchedule: true;   // sempre ativo em todos os planos
  patientManagement: true;
  scheduleBlocking: true;
  scheduleOverride: boolean;     // agendar fora do horário (CLINIC_MANAGER+)
  // Canal e comunicação
  waitlist: boolean;
  whatsappChannel: boolean;
  messagingTemplates: boolean;
  appointmentReminders: boolean; // follow-up pré e pós consulta
  // Gestão e analytics
  operationalKpis: boolean;
  executiveDashboard: boolean;
  // Operação avançada
  procedureProtocols: boolean;
  multiUnit: boolean;
  // IA
  aiCaptacaoAgent: boolean;
  aiAgendamentoAgent: boolean;
}

export const PLAN_FEATURES: Record<CommercialPlanCode, PlanFeatureSet> = {
  ESTETICA_START: {
    limits: { maxProfessionals: 3, maxUnits: 1 },
    receptionAndSchedule: true,
    patientManagement: true,
    scheduleBlocking: true,
    scheduleOverride: false,
    waitlist: false,
    whatsappChannel: false,
    messagingTemplates: false,
    appointmentReminders: false,
    operationalKpis: false,
    executiveDashboard: false,
    procedureProtocols: false,
    multiUnit: false,
    aiCaptacaoAgent: false,
    aiAgendamentoAgent: false,
  },
  ESTETICA_FLOW: {
    limits: { maxProfessionals: 8, maxUnits: 2 },
    receptionAndSchedule: true,
    patientManagement: true,
    scheduleBlocking: true,
    scheduleOverride: true,
    waitlist: true,
    whatsappChannel: true,
    messagingTemplates: true,
    appointmentReminders: true,
    operationalKpis: true,
    executiveDashboard: false,
    procedureProtocols: false,
    multiUnit: false,
    aiCaptacaoAgent: false,
    aiAgendamentoAgent: false,
  },
  ESTETICA_SCALE: {
    limits: { maxProfessionals: null, maxUnits: null },
    receptionAndSchedule: true,
    patientManagement: true,
    scheduleBlocking: true,
    scheduleOverride: true,
    waitlist: true,
    whatsappChannel: true,
    messagingTemplates: true,
    appointmentReminders: true,
    operationalKpis: true,
    executiveDashboard: true,
    procedureProtocols: true,
    multiUnit: true,
    aiCaptacaoAgent: true,
    aiAgendamentoAgent: true,
  },
} as const;

export function getPlanFeatures(planCode: string): PlanFeatureSet | null {
  return PLAN_FEATURES[planCode as CommercialPlanCode] ?? null;
}
