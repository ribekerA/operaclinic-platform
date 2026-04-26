import type {
  ClinicSkillName,
  SkillAppointmentPayload,
  SkillSlotHoldPayload,
} from "./agent-skills";
import type {
  MessagingHandoffPayload,
  MessagingThreadDetailPayload,
} from "./messaging";
import type {
  ReceptionAvailabilitySlot,
  ReceptionPatientSummary,
} from "./reception";

export type AgentKind = "CAPTACAO" | "AGENDAMENTO";

export type AgentExecutionStatus =
  | "WAITING_FOR_INPUT"
  | "WAITING_FOR_SLOT_SELECTION"
  | "HANDOFF_OPENED"
  | "COMPLETED"
  | "FAILED";

export type AgentSkillTraceStatus = "SUCCESS" | "FAILED";

export interface AgentSkillTracePayload {
  skillName: ClinicSkillName;
  status: AgentSkillTraceStatus;
  startedAt: string;
  finishedAt: string;
  error: string | null;
}

export interface AgentExecutionMetaPayload {
  agent: AgentKind;
  tenantId: string;
  actorUserId: string;
  threadId: string | null;
  correlationId: string;
  status: AgentExecutionStatus;
  steps: AgentSkillTracePayload[];
}

export interface CaptacaoAgentRequestPayload {
  threadId: string;
  messageText: string;
  patientPhone?: string;
  patientName?: string;
}

export interface CaptacaoAgentResponsePayload {
  meta: AgentExecutionMetaPayload;
  patient: ReceptionPatientSummary | null;
  handoff: MessagingHandoffPayload | null;
  thread: MessagingThreadDetailPayload | null;
  replyText: string | null;
}

export interface AgendamentoAgentRequestPayload {
  threadId: string;
  messageText?: string;
  patientId: string;
  professionalId: string;
  consultationTypeId: string;
  preferredDate?: string;
  unitId?: string;
  selectedSlotStartsAt?: string;
  confirmSelectedSlot?: boolean;
}

export interface AgendamentoAgentResponsePayload {
  meta: AgentExecutionMetaPayload;
  availability: ReceptionAvailabilitySlot[];
  hold: SkillSlotHoldPayload | null;
  appointment: SkillAppointmentPayload | null;
  handoff: MessagingHandoffPayload | null;
  thread: MessagingThreadDetailPayload | null;
  replyText: string | null;
}
