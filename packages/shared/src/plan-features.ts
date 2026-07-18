export type CommercialPlanCode = "ESTETICA_START" | "ESTETICA_FLOW" | "ESTETICA_SCALE";

export interface PlanLimits {
  maxProfessionals: number | null; // null = sem limite
  maxUnits: number | null; // null = sem limite
  monthlyAiConversations: number | null; // null = sem limite; janela mensal alinhada ao ciclo de cobrança
}

export interface PlanFeatureSet {
  limits: PlanLimits;
  // Operação core
  receptionAndSchedule: true; // sempre ativo em todos os planos
  patientManagement: true;
  scheduleBlocking: true;
  scheduleOverride: boolean; // agendar fora do horário configurado (CLINIC_MANAGER+)
  // Canal e comunicação — WhatsApp + IA são o diferencial competitivo, presentes em TODOS os planos
  waitlist: boolean;
  whatsappChannel: true; // sempre ativo em todos os planos
  messagingTemplates: boolean;
  appointmentReminders: true; // lembretes/follow-ups automáticos, sempre ativo em todos os planos
  // IA — captação e agendamento autônomos, sempre ativo em todos os planos
  aiCaptacaoAgent: true;
  aiAgendamentoAgent: true;
  // Gestão e analytics
  operationalKpis: boolean;
  executiveDashboard: boolean;
  // Operação avançada
  procedureProtocols: boolean;
  multiUnit: boolean;
}

/** Overrides parciais de limites, aplicáveis por tenant (ex.: negociação comercial de founding customers). */
export type PlanLimitOverrides = Partial<PlanLimits>;

/** Overrides parciais de features booleanas, aplicáveis por tenant. `limits` é tratado separadamente via {@link PlanLimitOverrides}. */
export type PlanFeatureOverrides = Partial<Omit<PlanFeatureSet, "limits">>;

export const PLAN_FEATURES: Record<CommercialPlanCode, PlanFeatureSet> = {
  ESTETICA_START: {
    limits: { maxProfessionals: 3, maxUnits: 1, monthlyAiConversations: 200 },
    receptionAndSchedule: true,
    patientManagement: true,
    scheduleBlocking: true,
    scheduleOverride: false,
    waitlist: false,
    whatsappChannel: true,
    messagingTemplates: false,
    appointmentReminders: true,
    aiCaptacaoAgent: true,
    aiAgendamentoAgent: true,
    operationalKpis: false,
    executiveDashboard: false,
    procedureProtocols: false,
    multiUnit: false,
  },
  ESTETICA_FLOW: {
    limits: { maxProfessionals: 8, maxUnits: 2, monthlyAiConversations: 800 },
    receptionAndSchedule: true,
    patientManagement: true,
    scheduleBlocking: true,
    scheduleOverride: true,
    waitlist: true,
    whatsappChannel: true,
    messagingTemplates: true,
    appointmentReminders: true,
    aiCaptacaoAgent: true,
    aiAgendamentoAgent: true,
    operationalKpis: true,
    executiveDashboard: false,
    procedureProtocols: false,
    multiUnit: false,
  },
  ESTETICA_SCALE: {
    limits: { maxProfessionals: null, maxUnits: null, monthlyAiConversations: null },
    receptionAndSchedule: true,
    patientManagement: true,
    scheduleBlocking: true,
    scheduleOverride: true,
    waitlist: true,
    whatsappChannel: true,
    messagingTemplates: true,
    appointmentReminders: true,
    aiCaptacaoAgent: true,
    aiAgendamentoAgent: true,
    operationalKpis: true,
    executiveDashboard: true,
    procedureProtocols: true,
    multiUnit: true,
  },
} as const;

export function getPlanFeatures(planCode: string): PlanFeatureSet | null {
  return PLAN_FEATURES[planCode as CommercialPlanCode] ?? null;
}

/**
 * Aplica overrides por tenant (ex.: negociação comercial) sobre a matriz default de um plano.
 * `shared` continua sendo o contrato de tipos e o default; a persistência do override é responsabilidade do backend
 * (módulo `platform`), que resolve o override por tenant e chama esta função para compor o entitlement efetivo.
 */
export function applyPlanFeatureOverrides(
  base: PlanFeatureSet,
  featureOverrides?: PlanFeatureOverrides,
  limitOverrides?: PlanLimitOverrides,
): PlanFeatureSet {
  return {
    ...base,
    ...featureOverrides,
    limits: { ...base.limits, ...limitOverrides },
  };
}
