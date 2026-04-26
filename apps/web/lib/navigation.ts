import { resolveAestheticClinicActor } from "@/lib/clinic-actor";
import { platformCommandCenterDomains } from "@/lib/platform-command-center";

export type UserProfile = "platform" | "clinic";

export interface NavigationItem {
  label: string;
  href: string;
  description: string;
  enabled: boolean;
  allowedRoles?: string[];
}

const platformNavigation: NavigationItem[] = platformCommandCenterDomains.map((domain) => ({
  label: domain.label,
  href: domain.href,
  description: domain.description,
  enabled: true,
}));

function buildClinicNavigation(roles: string[]): NavigationItem[] {
  const actor = resolveAestheticClinicActor(roles);

  switch (actor) {
    case "admin":
      return [
        {
          label: "Painel",
          href: "/clinic",
          description: "Visao geral da operacao, equipe e saude da clinica",
          enabled: true,
        },
        {
          label: "Recepcao",
          href: "/clinic/reception",
          description: "Agenda do dia, confirmacoes, fila e atendimento",
          enabled: true,
        },
        {
          label: "Inbox",
          href: "/clinic/inbox",
          description: "Conversas com IA que precisam de atendimento humano urgente",
          enabled: true,
        },
        {
          label: "Mensagens",
          href: "/clinic/messaging",
          description: "Threads do WhatsApp, handoffs e excecoes da recepcao",
          enabled: true,
        },
        {
          label: "Integracoes",
          href: "/clinic/integrations",
          description: "WhatsApp, readiness e conexoes operacionais da clinica",
          enabled: true,
        },
        {
          label: "Pacientes",
          href: "/clinic/patients",
          description: "Busca, cadastro e acompanhamento administrativo",
          enabled: true,
        },
        {
          label: "Usuarios",
          href: "/clinic/users",
          description: "Papeis e acessos da equipe da clinica",
          enabled: true,
        },
        {
          label: "Minha conta",
          href: "/clinic/account",
          description: "Senha, sessao atual e seguranca do seu acesso",
          enabled: true,
        },
        {
          label: "Profissionais",
          href: "/clinic/professionals",
          description: "Equipe, registros e vinculos por unidade",
          enabled: true,
        },
        {
          label: "Unidades",
          href: "/clinic/units",
          description: "Estrutura fisica e organizacao da clinica",
          enabled: true,
        },
        {
          label: "Especialidades",
          href: "/clinic/specialties",
          description: "Areas esteticas da clinica e escopo da equipe",
          enabled: true,
        },
        {
          label: "Procedimentos esteticos",
          href: "/clinic/consultation-types",
          description: "Duracao, buffers e formato dos procedimentos",
          enabled: true,
        },
      ];
    case "manager":
      return [
        {
          label: "Painel",
          href: "/clinic",
          description: "Ritmo da operacao, equipe e desempenho do dia a dia",
          enabled: true,
        },
        {
          label: "Recepcao",
          href: "/clinic/reception",
          description: "Fluxo do dia com confirmacoes, check-in e fila",
          enabled: true,
        },
        {
          label: "Inbox",
          href: "/clinic/inbox",
          description: "Gerenciamento de conversas escaladas pelo robô",
          enabled: true,
        },
        {
          label: "Mensagens",
          href: "/clinic/messaging",
          description: "Inbox operacional das conversas que exigem atendimento humano",
          enabled: true,
        },
        {
          label: "Integracoes",
          href: "/clinic/integrations",
          description: "WhatsApp, readiness e conexoes operacionais da clinica",
          enabled: true,
        },
        {
          label: "Pacientes",
          href: "/clinic/patients",
          description: "Busca e acompanhamento administrativo",
          enabled: true,
        },
        {
          label: "Minha conta",
          href: "/clinic/account",
          description: "Seguranca do acesso e dados do usuario ativo",
          enabled: true,
        },
        {
          label: "Profissionais",
          href: "/clinic/professionals",
          description: "Escala, registros e visibilidade da equipe",
          enabled: true,
        },
        {
          label: "Unidades",
          href: "/clinic/units",
          description: "Organizacao das unidades e da operacao",
          enabled: true,
        },
        {
          label: "Especialidades",
          href: "/clinic/specialties",
          description: "Especialidades esteticas ativas na operacao",
          enabled: true,
        },
        {
          label: "Procedimentos esteticos",
          href: "/clinic/consultation-types",
          description: "Configuracoes dos procedimentos usados na agenda",
          enabled: true,
        },
      ];
    case "reception":
      return [
        {
          label: "Recepcao",
          href: "/clinic/reception",
          description: "Agenda do dia, confirmacoes, check-in e fila",
          enabled: true,
        },
        {
          label: "Inbox",
          href: "/clinic/inbox",
          description: "Fila de transbordo e atendimento humano",
          enabled: true,
        },
        {
          label: "Mensagens",
          href: "/clinic/messaging",
          description: "Handoffs e threads que a recepcao precisa assumir",
          enabled: true,
        },
        {
          label: "Pacientes",
          href: "/clinic/patients",
          description: "Busca e cadastro rapido para o atendimento",
          enabled: true,
        },
        {
          label: "Minha conta",
          href: "/clinic/account",
          description: "Senha e dados do acesso usado na recepcao",
          enabled: true,
        },
        {
          label: "Profissionais",
          href: "/clinic/professionals",
          description: "Equipe estetica disponivel para agendamento",
          enabled: true,
        },
        {
          label: "Unidades",
          href: "/clinic/units",
          description: "Unidades ativas para procedimentos e agenda",
          enabled: true,
        },
        {
          label: "Procedimentos esteticos",
          href: "/clinic/consultation-types",
          description: "Referencia rapida dos procedimentos disponiveis",
          enabled: true,
        },
      ];
    case "professional":
      return [
        {
          label: "Minha conta",
          href: "/clinic/account",
          description: "Senha, sessao atual e acesso reservado do profissional",
          enabled: true,
        },
        {
          label: "Meu espaco",
          href: "/clinic/professional",
          description: "Agenda pessoal, foco do atendimento e leitura do dia do profissional",
          enabled: true,
        },
      ];
    default:
      return [];
  }
}

function hasAllowedRole(item: NavigationItem, roles: string[] | undefined): boolean {
  if (!item.allowedRoles || item.allowedRoles.length === 0) {
    return true;
  }

  if (!roles || roles.length === 0) {
    return false;
  }

  return item.allowedRoles.some((role) => roles.includes(role));
}

export function getNavigationByProfile(
  profile: UserProfile,
  roles?: string[],
): NavigationItem[] {
  if (profile === "clinic") {
    return buildClinicNavigation(roles ?? []);
  }

  return platformNavigation.filter((item) => hasAllowedRole(item, roles));
}

export function canAccessPath(profile: UserProfile, pathname: string): boolean {
  const items =
    profile === "clinic"
      ? [
          ...buildClinicNavigation(["TENANT_ADMIN"]),
          ...buildClinicNavigation(["CLINIC_MANAGER"]),
          ...buildClinicNavigation(["RECEPTION"]),
          ...buildClinicNavigation(["PROFESSIONAL"]),
        ]
      : platformNavigation;
  return items.some((item) => pathname.startsWith(item.href));
}
