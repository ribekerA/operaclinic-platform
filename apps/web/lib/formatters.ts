import {
  RoleCode,
  SubscriptionStatus,
  TenantStatus,
  UserStatus,
} from "@/lib/client/platform-identity-api";
import type {
  CommercialOnboardingStatus,
  HandoffStatus,
  MessageEventDirection,
  MessageThreadStatus,
  PlatformHealthLevel,
  ReceptionAppointmentStatus,
} from "@operaclinic/shared";

interface TimezoneFormattingOptions {
  timeZone?: string;
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function getFormatter(
  key: string,
  options: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat {
  const cached = formatterCache.get(key);

  if (cached) {
    return cached;
  }

  const formatter = new Intl.DateTimeFormat("pt-BR", options);
  formatterCache.set(key, formatter);

  return formatter;
}

function getDateTimeFormatter(timeZone?: string): Intl.DateTimeFormat {
  return getFormatter(`datetime:${timeZone ?? "default"}`, {
    dateStyle: "short",
    timeStyle: "short",
    ...(timeZone ? { timeZone } : {}),
  });
}

function getTimeFormatter(timeZone?: string): Intl.DateTimeFormat {
  return getFormatter(`time:${timeZone ?? "default"}`, {
    hour: "2-digit",
    minute: "2-digit",
    ...(timeZone ? { timeZone } : {}),
  });
}

function getDateFormatter(timeZone?: string): Intl.DateTimeFormat {
  return getFormatter(`date:${timeZone ?? "default"}`, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    ...(timeZone ? { timeZone } : {}),
  });
}

export function formatDateTime(
  value: string,
  options?: TimezoneFormattingOptions,
): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return getDateTimeFormatter(options?.timeZone).format(date);
}

export function formatTime(
  value: string,
  options?: TimezoneFormattingOptions,
): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return getTimeFormatter(options?.timeZone).format(date);
}

export function formatDateLabel(
  value: string,
  options?: TimezoneFormattingOptions,
): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return getDateFormatter(options?.timeZone).format(date);
}

export function toDateInputInTimeZone(
  value: string,
  timeZone?: string,
): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const parts = getFormatter(`date-input:${timeZone ?? "default"}`, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    ...(timeZone ? { timeZone } : {}),
  }).formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) {
    return "";
  }

  return `${year}-${month}-${day}`;
}

export function formatCurrencyFromCents(
  valueInCents: number,
  currency: string,
): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency,
  }).format(valueInCents / 100);
}

const tenantStatusLabel: Record<TenantStatus, string> = {
  ACTIVE: "Ativo",
  INACTIVE: "Inativo",
  SUSPENDED: "Suspenso",
};

const platformHealthLabel: Record<PlatformHealthLevel, string> = {
  HEALTHY: "Saudavel",
  ATTENTION: "Atencao",
  CRITICAL: "Critico",
};

const userStatusLabel: Record<UserStatus, string> = {
  ACTIVE: "Ativo",
  INVITED: "Convite pendente",
  INACTIVE: "Desativado",
  SUSPENDED: "Bloqueado",
};

const subscriptionStatusLabel: Record<SubscriptionStatus, string> = {
  ACTIVE: "Ativa",
  CANCELED: "Cancelada",
  EXPIRED: "Expirada",
  PAST_DUE: "Em atraso",
  TRIAL: "Trial",
};

const roleLabel: Record<RoleCode, string> = {
  CLINIC_MANAGER: "Gestor da clinica",
  PLATFORM_ADMIN: "Admin da plataforma",
  PROFESSIONAL: "Profissional",
  RECEPTION: "Recepcao",
  SUPER_ADMIN: "Super admin",
  TENANT_ADMIN: "Admin da clinica",
};

const appointmentStatusLabel: Record<ReceptionAppointmentStatus, string> = {
  BOOKED: "Agendado",
  CONFIRMED: "Confirmado",
  CHECKED_IN: "Check-in",
  CALLED: "Chamado",
  IN_PROGRESS: "Em atendimento",
  AWAITING_CLOSURE: "Fechamento",
  AWAITING_PAYMENT: "Na recepcao",
  RESCHEDULED: "Remarcado",
  CANCELED: "Cancelado",
  COMPLETED: "Concluido",
  NO_SHOW: "No-show",
};

const messagingThreadStatusLabel: Record<MessageThreadStatus, string> = {
  OPEN: "Aberta",
  IN_HANDOFF: "Em handoff",
  CLOSED: "Resolvida",
};

const handoffStatusLabel: Record<HandoffStatus, string> = {
  OPEN: "Aberto",
  ASSIGNED: "Atribuido",
  CLOSED: "Fechado",
};

const messageDirectionLabel: Record<MessageEventDirection, string> = {
  INBOUND: "Paciente",
  OUTBOUND: "Recepcao",
  SYSTEM: "Sistema",
};

export function getTenantStatusLabel(status: TenantStatus): string {
  return tenantStatusLabel[status] ?? status;
}

export function getTenantStatusTone(
  status: TenantStatus,
): "success" | "warning" | "danger" {
  if (status === "ACTIVE") {
    return "success";
  }

  if (status === "SUSPENDED") {
    return "danger";
  }

  return "warning";
}

export function getUserStatusLabel(status: UserStatus): string {
  return userStatusLabel[status] ?? status;
}

export function getSubscriptionStatusLabel(status: SubscriptionStatus): string {
  return subscriptionStatusLabel[status] ?? status;
}

export function getSubscriptionStatusTone(
  status: SubscriptionStatus,
): "success" | "warning" | "danger" | "neutral" {
  switch (status) {
    case "ACTIVE":
      return "success";
    case "PAST_DUE":
      return "danger";
    case "TRIAL":
      return "warning";
    case "CANCELED":
    case "EXPIRED":
      return "neutral";
    default:
      return "neutral";
  }
}

export function getRoleLabel(roleCode: RoleCode): string {
  return roleLabel[roleCode] ?? roleCode;
}

export function getPlatformHealthLabel(level: PlatformHealthLevel): string {
  return platformHealthLabel[level] ?? level;
}

export function getPlatformHealthTone(
  level: PlatformHealthLevel,
): "success" | "warning" | "danger" {
  if (level === "HEALTHY") {
    return "success";
  }

  if (level === "CRITICAL") {
    return "danger";
  }

  return "warning";
}

export function getAppointmentStatusLabel(
  status: ReceptionAppointmentStatus,
): string {
  return appointmentStatusLabel[status] ?? status;
}

export function getAppointmentStatusTone(
  status: ReceptionAppointmentStatus,
): "success" | "warning" | "danger" | "neutral" {
  switch (status) {
    case "CONFIRMED":
    case "CHECKED_IN":
    case "CALLED":
    case "IN_PROGRESS":
    case "AWAITING_CLOSURE":
    case "AWAITING_PAYMENT":
    case "COMPLETED":
      return "success";
    case "BOOKED":
    case "RESCHEDULED":
      return "warning";
    case "CANCELED":
    case "NO_SHOW":
      return "danger";
    default:
      return "neutral";
  }
}

export function getMessagingThreadStatusLabel(
  status: MessageThreadStatus,
): string {
  return messagingThreadStatusLabel[status] ?? status;
}

export function getMessagingThreadStatusTone(
  status: MessageThreadStatus,
): "success" | "warning" | "danger" | "neutral" {
  switch (status) {
    case "OPEN":
      return "warning";
    case "IN_HANDOFF":
      return "danger";
    case "CLOSED":
      return "success";
    default:
      return "neutral";
  }
}

export function getHandoffStatusLabel(status: HandoffStatus): string {
  return handoffStatusLabel[status] ?? status;
}

export function getHandoffStatusTone(
  status: HandoffStatus,
): "success" | "warning" | "danger" | "neutral" {
  switch (status) {
    case "OPEN":
      return "warning";
    case "ASSIGNED":
      return "danger";
    case "CLOSED":
      return "success";
    default:
      return "neutral";
  }
}

export function getMessageDirectionLabel(
  direction: MessageEventDirection,
): string {
  return messageDirectionLabel[direction] ?? direction;
}

const onboardingStatusLabel: Record<CommercialOnboardingStatus, string> = {
  INITIATED: "Iniciado",
  AWAITING_PAYMENT: "Aguardando pagamento",
  PAID: "Pago",
  ONBOARDING_STARTED: "Configurando clinica",
  ONBOARDING_COMPLETED: "Concluido",
  EXPIRED: "Expirado",
  ESCALATED_TO_STAFF: "Suporte manual",
};

export function getOnboardingStatusLabel(
  status: CommercialOnboardingStatus,
): string {
  return onboardingStatusLabel[status] ?? status;
}

export function getOnboardingStatusTone(
  status: CommercialOnboardingStatus,
): "success" | "warning" | "danger" | "neutral" {
  switch (status) {
    case "ONBOARDING_COMPLETED":
      return "success";
    case "PAID":
    case "ONBOARDING_STARTED":
      return "warning";
    case "ESCALATED_TO_STAFF":
      return "danger";
    case "INITIATED":
    case "AWAITING_PAYMENT":
      return "warning";
    case "EXPIRED":
      return "neutral";
    default:
      return "neutral";
  }
}
