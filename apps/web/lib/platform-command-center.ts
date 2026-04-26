export type CommandCenterDomainStatus = "live" | "partial" | "planned";
export type CommandCenterDeliveryPhase = "lote-1" | "fase-2" | "fase-3";

export interface CommandCenterDomainDefinition {
  label: string;
  href: string;
  description: string;
  status: CommandCenterDomainStatus;
  phase: CommandCenterDeliveryPhase;
  activationRule: string;
}

export const platformCommandCenterDomains: CommandCenterDomainDefinition[] = [
  {
    label: "Overview",
    href: "/platform",
    description: "Leitura unica da saude do sistema, receita, tenants em risco e acao recomendada.",
    status: "live",
    phase: "lote-1",
    activationRule: "Usa sinais reais ja consolidados de dashboard, readiness e operacao.",
  },
  {
    label: "Operations",
    href: "/platform/operations",
    description: "No-show, agenda previsivel, pendencias de confirmacao e carga operacional imediata.",
    status: "partial",
    phase: "lote-1",
    activationRule:
      "Entra com sinais ja existentes da plataforma; score completo depende de consolidar KPIs por tenant.",
  },
  {
    label: "Growth",
    href: "/platform/growth",
    description: "Pipeline, qualificacao, demos, fechamento e reativacao comercial.",
    status: "planned",
    phase: "fase-2",
    activationRule:
      "So entra com score real quando houver funil e origem de lead persistidos de ponta a ponta.",
  },
  {
    label: "SEO",
    href: "/platform/seo",
    description: "Conteudo, intencao organica, conversao de pagina e lacunas por ICP.",
    status: "planned",
    phase: "fase-2",
    activationRule:
      "Depende de fonte persistida de paginas, palavras-chave e conversao organica para lead.",
  },
  {
    label: "Market Intelligence",
    href: "/platform/market-intelligence",
    description: "Sinais internos de ICP, objecoes, planos mais vendidos e padroes de churn.",
    status: "planned",
    phase: "fase-2",
    activationRule:
      "Depende de consolidar sinais comerciais, churn e motivos de perda em uma camada unica.",
  },
  {
    label: "Finance",
    href: "/platform/finance",
    description: "MRR, receita em risco, mix de planos e leitura financeira da base ativa.",
    status: "partial",
    phase: "lote-1",
    activationRule:
      "Ja entra com carteira contratada; caixa, margem e forecast exigem dados adicionais.",
  },
  {
    label: "Tenants",
    href: "/platform/tenants",
    description: "Base ativa, prontidao operacional, setup pendente e risco por clinica.",
    status: "live",
    phase: "lote-1",
    activationRule: "Ja sustentado por snapshot multi-tenant existente no control plane.",
  },
  {
    label: "Agents & Skills",
    href: "/platform/agents",
    description: "Uso, fallback, handoff, impacto operacional e confiabilidade dos agentes.",
    status: "partial",
    phase: "lote-1",
    activationRule:
      "Ja entra com execucoes persistidas, fallback e skills por tenant; score final ainda depende de ligar isso a resolucao autonoma e ROI.",
  },
  {
    label: "Reliability",
    href: "/platform/reliability",
    description: "Readiness, integrações reais, riscos de scheduling e bloqueadores de rollout.",
    status: "partial",
    phase: "lote-1",
    activationRule:
      "Ja usa readiness e risco operacional; faltam queue lag, cron health e historico persistente.",
  },
  {
    label: "Product Control",
    href: "/platform/product-control",
    description: "Backlog critico, rollout, risco de inercia e evolucao do produto.",
    status: "partial",
    phase: "lote-1",
    activationRule:
      "Estrutura entra agora; score definitivo depende de backlog vivo, bugs e lead time centralizados.",
  },
  {
    label: "CEO Mode",
    href: "/platform/ceo-mode",
    description: "Camada sintetica de decisao com proxima acao, risco e evolucao em poucos minutos.",
    status: "planned",
    phase: "fase-2",
    activationRule:
      "Depende de unificar growth, financas, operacoes, agentes e produto em um score executivo confiavel.",
  },
];

export function getCommandCenterStatusLabel(
  status: CommandCenterDomainStatus,
): string {
  if (status === "live") {
    return "Ativo";
  }

  if (status === "partial") {
    return "Parcial";
  }

  return "Planejado";
}

export function getCommandCenterStatusTone(
  status: CommandCenterDomainStatus,
): "success" | "warning" | "neutral" {
  if (status === "live") {
    return "success";
  }

  if (status === "partial") {
    return "warning";
  }

  return "neutral";
}

export function getCommandCenterPhaseLabel(
  phase: CommandCenterDeliveryPhase,
): string {
  if (phase === "lote-1") {
    return "Lote 1";
  }

  if (phase === "fase-2") {
    return "Fase 2";
  }

  return "Fase 3";
}
