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
    name: "Start Estetica",
    description:
      "Para clinicas esteticas privadas com recepcao enxuta e agenda em organizacao inicial.",
    priceCents: 19900,
    currency: "BRL",
    publicMetadata: {
      slug: "start-estetica",
      summary:
        "Para clinicas esteticas privadas que querem sair da agenda baguncada e organizar recepcao, confirmacao e rotina inicial.",
      idealFor: "1 a 3 profissionais e uma recepcao enxuta.",
      implementation:
        "Entrada mais leve para colocar recepcao, agenda e atendimento do dia na mesma base.",
      highlights: [
        "Agenda por profissional",
        "Recepcao web para confirmar e remarcar",
        "Base inicial para operar o WhatsApp da clinica sem improviso",
      ],
    },
  },
  {
    code: "ESTETICA_FLOW",
    name: "Flow Estetica",
    description:
      "Para clinicas com forte operacao no WhatsApp, confirmacao e remarcacao frequente.",
    priceCents: 34900,
    currency: "BRL",
    publicMetadata: {
      slug: "flow-estetica",
      summary:
        "Para clinicas com forte operacao no WhatsApp e necessidade real de reduzir no-show, remarcacao perdida e sobrecarga da recepcao.",
      idealFor: "2 a 6 profissionais, recepcao ativa e alto volume de mensagens.",
      implementation:
        "Onboarding comercial assistido com foco em agenda do dia, confirmacao e fluxo operacional.",
      highlights: [
        "Confirmacao e preparacao do atendimento com foco em menos no-show",
        "Mais leitura operacional para recepcao e gestao",
        "Base organizada para harmonizacao facial e estetica avancada",
      ],
      featured: true,
    },
  },
  {
    code: "ESTETICA_SCALE",
    name: "Scale Estetica",
    description:
      "Para clinicas com mais profissionais, recepcao ativa e maior volume ao longo do dia.",
    priceCents: 54900,
    currency: "BRL",
    publicMetadata: {
      slug: "scale-estetica",
      summary:
        "Para clinicas com mais profissionais, recepcao mais intensa e necessidade de mais controle sobre agenda, equipe e operacao do dia.",
      idealFor: "Clinicas em crescimento ou operacao premium com mais equipe.",
      implementation:
        "Implantacao por etapas para aumentar capacidade sem baguncar a rotina da clinica.",
      highlights: [
        "Mais estrutura para recepcao, agenda e equipe",
        "Operacao preparada para crescer com isolamento correto por clinica",
        "Mais controle comercial antes da entrada do provider de pagamento real",
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
