export type CommercialOnboardingStatus =
  | "INITIATED"
  | "AWAITING_PAYMENT"
  | "PAID"
  | "ONBOARDING_STARTED"
  | "ONBOARDING_COMPLETED"
  | "ESCALATED_TO_STAFF"
  | "EXPIRED";

export const COMMERCIAL_PUBLIC_PLAN_CODES = [
  "ESTETICA_START",
  "ESTETICA_FLOW",
  "ESTETICA_SCALE",
] as const;

export type CommercialPublicPlanCode =
  (typeof COMMERCIAL_PUBLIC_PLAN_CODES)[number];

export interface CommercialPublicPlanMetadataPayload {
  slug: string;
  summary: string;
  idealFor: string;
  implementation: string;
  highlights: string[];
  featured?: boolean;
}

export interface CommercialPublicPlanCatalogEntry {
  code: CommercialPublicPlanCode;
  name: string;
  description: string;
  priceCents: number;
  currency: string;
  publicMetadata: CommercialPublicPlanMetadataPayload;
}

export const COMMERCIAL_PUBLIC_PLAN_CATALOG: readonly CommercialPublicPlanCatalogEntry[] = [
  {
    code: "ESTETICA_START",
    name: "Start Estética",
    description:
      "Para clínicas estéticas privadas com recepção enxuta e agenda em organização inicial.",
    priceCents: 19900,
    currency: "BRL",
    publicMetadata: {
      slug: "start-estética",
      summary:
        "Para clínicas de estética que querem sair da agenda bagunçada e organizar recepção, confirmação e atendimento do dia em um só lugar — sem planilha e sem improviso.",
      idealFor: "Clínicas com até 3 profissionais e recepção enxuta.",
      implementation:
        "Ativação guiada em até 48h. Foco total em colocar agenda e recepção rodando no primeiro dia.",
      highlights: [
        "Até 3 profissionais · 1 unidade",
        "Agenda por profissional com controle de disponibilidade",
        "Recepção web — criar, confirmar, remarcar e check-in",
        "Base de pacientes com histórico de atendimentos",
        "Bloqueio de horário para pausas e procedimentos",
      ],
    },
  },
  {
    code: "ESTETICA_FLOW",
    name: "Flow Estética",
    description:
      "Para clínicas com forte operação no WhatsApp, confirmação e remarcação frequente.",
    priceCents: 34900,
    currency: "BRL",
    publicMetadata: {
      slug: "flow-estética",
      summary:
        "Para clínicas de estética com forte volume no WhatsApp que precisam reduzir no-show, dominar remarcações e dar mais leitura operacional para recepção e gestão — sem precisar de planilha paralela.",
      idealFor: "Clínicas com até 8 profissionais e recepção ativa com alto volume de mensagens.",
      implementation:
        "Onboarding assistido com foco em redução de no-show e ativação do canal WhatsApp desde o primeiro dia.",
      highlights: [
        "Até 8 profissionais · 2 unidades",
        "Canal WhatsApp integrado — inbox, threads e handoff para equipe",
        "Confirmação automática de agendamento 24h antes",
        "Lista de espera para preencher cancelamentos de última hora",
        "KPIs operacionais — taxa de ocupação, no-show e confirmações",
        "Templates de mensagem personalizados por procedimento",
      ],
      featured: true,
    },
  },
  {
    code: "ESTETICA_SCALE",
    name: "Scale Estética",
    description:
      "Para clínicas com mais profissionais, múltiplas unidades e necessidade de automação com IA.",
    priceCents: 54900,
    currency: "BRL",
    publicMetadata: {
      slug: "scale-estética",
      summary:
        "Para clínicas de estética em crescimento ou operação premium que precisam de visibilidade executiva completa, protocolos de procedimento padronizados e automação com IA para captação e agendamento.",
      idealFor: "Clínicas com equipe grande, múltiplas unidades ou alto volume de leads novos.",
      implementation:
        "Implantação por etapas com time de sucesso dedicado. Ativação da IA após estabilização da operação base.",
      highlights: [
        "Profissionais e unidades ilimitados",
        "Dashboard executivo com visão completa da operação",
        "Protocolos de procedimento por tipo de atendimento",
        "Agente de IA para captação e qualificação de leads no WhatsApp",
        "Agente de IA para agendamento automático via WhatsApp",
        "Relatórios avançados por profissional, unidade e período",
      ],
    },
  },
] as const;

export interface StartCommercialOnboardingPayload {
  planId: string;
}

export interface CompleteCommercialOnboardingPayload {
  clinicDisplayName: string;
  clinicLegalName?: string;
  clinicDocumentNumber?: string;
  clinicContactEmail: string;
  clinicContactPhone: string;
  timezone?: string;
  initialUnitName?: string;
  adminFullName: string;
  adminEmail: string;
}

export interface CommercialPlanSummaryPayload {
  id: string;
  code: string;
  name: string;
  description: string | null;
  priceCents: number;
  currency: string;
  isActive: boolean;
  isPublic: boolean;
  publicMetadata: CommercialPublicPlanMetadataPayload | null;
}

export interface CommercialOnboardingSummaryPayload {
  id: string;
  status: CommercialOnboardingStatus;
  selectedPlan: CommercialPlanSummaryPayload;
  clinic: {
    displayName: string | null;
    legalName: string | null;
    documentNumber: string | null;
    contactEmail: string | null;
    contactPhone: string | null;
    timezone: string | null;
    initialUnitName: string | null;
  };
  admin: {
    fullName: string | null;
    email: string | null;
  };
  payment: {
    reference: string | null;
    confirmedAt: string | null;
    mockConfirmationAvailable: boolean;
  };
  onboarding: {
    tenantId: string | null;
    clinicId: string | null;
    unitId: string | null;
    adminUserId: string | null;
    subscriptionId: string | null;
    expiresAt: string | null;
    startedAt: string | null;
    completedAt: string | null;
  };
  nextStep:
    | "complete_registration"
    | "confirm_checkout"
    | "finalize_onboarding"
    | "login_clinic"
    | "restart_onboarding";
  login: {
    path: string | null;
    email: string | null;
  };
}

export interface CommercialStartOnboardingResponsePayload {
  onboardingToken: string;
  onboarding: CommercialOnboardingSummaryPayload;
}

export function isCommercialPublicPlanCode(
  value: string,
): value is CommercialPublicPlanCode {
  return COMMERCIAL_PUBLIC_PLAN_CODES.includes(
    value as CommercialPublicPlanCode,
  );
}

export function findCommercialPublicPlanCatalogEntry(
  code: string,
): CommercialPublicPlanCatalogEntry | null {
  return (
    COMMERCIAL_PUBLIC_PLAN_CATALOG.find((entry) => entry.code === code) ?? null
  );
}

export interface CommercialAdminOnboardingSummary {
  id: string;
  status: CommercialOnboardingStatus;
  clinicDisplayName: string | null;
  clinicContactEmail: string | null;
  adminEmail: string | null;
  planCode: string;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  paymentReference: string | null;
  tenantId: string | null;
}

export interface CommercialAdminListOnboardingsQuery {
  status?: CommercialOnboardingStatus;
  search?: string;
  page?: string;
  limit?: string;
}
