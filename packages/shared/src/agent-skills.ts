import type {
  CancelReceptionAppointmentPayload,
  CreateReceptionAppointmentPayload,
  ReceptionAppointmentStatus,
  ReceptionAvailabilityQuery,
  ReceptionAvailabilitySlot,
  ReceptionPatientSummary,
  ReceptionStatusActionPayload,
  RescheduleReceptionAppointmentPayload,
} from "./reception";
import type {
  CloseMessagingHandoffPayload,
  MessagingHandoffPayload,
  MessagingThreadDetailPayload,
  OpenMessagingHandoffPayload,
  SendMessagingThreadMessagePayload,
} from "./messaging";

export type ClinicSkillName =
  | "find_or_merge_patient"
  | "search_availability"
  | "hold_slot"
  | "create_appointment"
  | "confirm_appointment"
  | "reschedule_appointment"
  | "cancel_appointment"
  | "open_handoff"
  | "close_handoff"
  | "send_message";

export type ClinicSkillCategory = "PATIENTS" | "SCHEDULING" | "MESSAGING";

export type ClinicSkillAllowedRole =
  | "TENANT_ADMIN"
  | "CLINIC_MANAGER"
  | "RECEPTION";

export type ClinicSkillExecutionSource =
  | "RECEPTION"
  | "MESSAGING"
  | "AGENT"
  | "SYSTEM_TEST";

export interface ClinicSkillContext {
  tenantId: string;
  actorUserId: string;
  source: ClinicSkillExecutionSource;
  threadId?: string;
  correlationId?: string;
}

export interface ClinicSkillDescriptor<TName extends ClinicSkillName = ClinicSkillName> {
  name: TName;
  category: ClinicSkillCategory;
  description: string;
  allowedRoles: ClinicSkillAllowedRole[];
}

export interface SkillPatientContactInput {
  type: "PHONE" | "WHATSAPP";
  value: string;
  isPrimary?: boolean;
}

export interface FindOrMergePatientSkillInput {
  fullName?: string;
  birthDate?: string;
  documentNumber?: string;
  notes?: string;
  isActive?: boolean;
  contacts: SkillPatientContactInput[];
}

export type SearchAvailabilitySkillInput = ReceptionAvailabilityQuery;

export interface HoldSlotSkillInput {
  patientId?: string;
  professionalId: string;
  consultationTypeId: string;
  unitId?: string;
  room?: string;
  startsAt: string;
  ttlMinutes?: number;
}

export type CreateAppointmentSkillInput = CreateReceptionAppointmentPayload;

export interface ConfirmAppointmentSkillInput extends ReceptionStatusActionPayload {
  appointmentId: string;
}

export interface RescheduleAppointmentSkillInput
  extends RescheduleReceptionAppointmentPayload {
  appointmentId: string;
}

export interface CancelAppointmentSkillInput
  extends CancelReceptionAppointmentPayload {
  appointmentId: string;
}

export type OpenHandoffSkillInput = OpenMessagingHandoffPayload;

export interface CloseHandoffSkillInput extends CloseMessagingHandoffPayload {
  handoffId: string;
}

export interface SendMessageSkillInput extends SendMessagingThreadMessagePayload {
  threadId: string;
  metadata?: Record<string, unknown>;
}

export interface SkillSlotHoldPayload {
  id: string;
  tenantId: string;
  patientId: string | null;
  professionalId: string;
  consultationTypeId: string;
  unitId: string | null;
  room: string | null;
  startsAt: string;
  endsAt: string;
  status: "ACTIVE" | "CONSUMED" | "CANCELED" | "EXPIRED";
  expiresAt: string;
  createdByUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SkillAppointmentPayload {
  id: string;
  tenantId: string;
  patientId: string;
  professionalId: string;
  consultationTypeId: string;
  unitId: string | null;
  slotHoldId: string | null;
  room: string | null;
  startsAt: string;
  endsAt: string;
  durationMinutes: number;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  status: ReceptionAppointmentStatus;
  confirmedAt: string | null;
  checkedInAt: string | null;
  noShowAt: string | null;
  idempotencyKey: string;
  cancellationReason: string | null;
  notes: string | null;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
  patient: {
    id: string;
    fullName: string | null;
  };
  professional: {
    id: string;
    fullName: string;
    displayName: string;
  };
  consultationType: {
    id: string;
    name: string;
    durationMinutes: number;
    bufferBeforeMinutes: number;
    bufferAfterMinutes: number;
  };
  unit: {
    id: string;
    name: string;
  } | null;
}

export interface ClinicSkillInputMap {
  find_or_merge_patient: FindOrMergePatientSkillInput;
  search_availability: SearchAvailabilitySkillInput;
  hold_slot: HoldSlotSkillInput;
  create_appointment: CreateAppointmentSkillInput;
  confirm_appointment: ConfirmAppointmentSkillInput;
  reschedule_appointment: RescheduleAppointmentSkillInput;
  cancel_appointment: CancelAppointmentSkillInput;
  open_handoff: OpenHandoffSkillInput;
  close_handoff: CloseHandoffSkillInput;
  send_message: SendMessageSkillInput;
}

export interface ClinicSkillOutputMap {
  find_or_merge_patient: ReceptionPatientSummary;
  search_availability: ReceptionAvailabilitySlot[];
  hold_slot: SkillSlotHoldPayload;
  create_appointment: SkillAppointmentPayload;
  confirm_appointment: SkillAppointmentPayload;
  reschedule_appointment: SkillAppointmentPayload;
  cancel_appointment: SkillAppointmentPayload;
  open_handoff: MessagingHandoffPayload;
  close_handoff: MessagingHandoffPayload;
  send_message: MessagingThreadDetailPayload;
}

export const CLINIC_SKILL_CATALOG: ClinicSkillDescriptor[] = [
  {
    name: "find_or_merge_patient",
    category: "PATIENTS",
    description: "Finds or merges a patient using the clinic patient core.",
    allowedRoles: ["TENANT_ADMIN", "CLINIC_MANAGER", "RECEPTION"],
  },
  {
    name: "search_availability",
    category: "SCHEDULING",
    description: "Searches backend-owned availability for a professional and consultation type.",
    allowedRoles: ["TENANT_ADMIN", "CLINIC_MANAGER", "RECEPTION"],
  },
  {
    name: "hold_slot",
    category: "SCHEDULING",
    description: "Creates a temporary slot hold using the scheduling core.",
    allowedRoles: ["TENANT_ADMIN", "CLINIC_MANAGER", "RECEPTION"],
  },
  {
    name: "create_appointment",
    category: "SCHEDULING",
    description: "Creates an appointment through the backend scheduling service.",
    allowedRoles: ["TENANT_ADMIN", "CLINIC_MANAGER", "RECEPTION"],
  },
  {
    name: "confirm_appointment",
    category: "SCHEDULING",
    description: "Confirms an appointment using the current appointment lifecycle rules.",
    allowedRoles: ["TENANT_ADMIN", "CLINIC_MANAGER", "RECEPTION"],
  },
  {
    name: "reschedule_appointment",
    category: "SCHEDULING",
    description: "Reschedules an appointment with conflict checks and status history.",
    allowedRoles: ["TENANT_ADMIN", "CLINIC_MANAGER", "RECEPTION"],
  },
  {
    name: "cancel_appointment",
    category: "SCHEDULING",
    description: "Cancels an appointment with audit and lifecycle enforcement.",
    allowedRoles: ["TENANT_ADMIN", "CLINIC_MANAGER", "RECEPTION"],
  },
  {
    name: "open_handoff",
    category: "MESSAGING",
    description: "Opens a messaging handoff so reception can treat the conversation.",
    allowedRoles: ["TENANT_ADMIN", "CLINIC_MANAGER", "RECEPTION"],
  },
  {
    name: "close_handoff",
    category: "MESSAGING",
    description: "Closes an active handoff and optionally resolves the thread.",
    allowedRoles: ["TENANT_ADMIN", "CLINIC_MANAGER", "RECEPTION"],
  },
  {
    name: "send_message",
    category: "MESSAGING",
    description: "Sends a human reply through the messaging provider boundary.",
    allowedRoles: ["TENANT_ADMIN", "CLINIC_MANAGER", "RECEPTION"],
  },
];
