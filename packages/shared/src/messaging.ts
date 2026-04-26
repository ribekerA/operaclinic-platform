export type MessagingChannel = "WHATSAPP";

export type MessagingIntegrationProvider = "WHATSAPP_MOCK" | "WHATSAPP_META";

export type MessagingIntegrationConnectionStatus = "ACTIVE" | "INACTIVE";

export type MessageThreadStatus = "OPEN" | "IN_HANDOFF" | "CLOSED";

export type MessageEventDirection = "INBOUND" | "OUTBOUND" | "SYSTEM";

export type MessageEventType =
  | "THREAD_CREATED"
  | "MESSAGE_RECEIVED"
  | "MESSAGE_SENT"
  | "MESSAGE_SEND_FAILED"
  | "HANDOFF_OPENED"
  | "HANDOFF_ASSIGNED"
  | "HANDOFF_CLOSED"
  | "THREAD_PATIENT_LINKED"
  | "THREAD_RESOLVED";

export type WebhookEventStatus = "RECEIVED" | "PROCESSED" | "IGNORED" | "FAILED";

export type HandoffStatus = "OPEN" | "ASSIGNED" | "CLOSED";

export type HandoffSource = "MANUAL" | "AUTOMATIC";

export type HandoffPriority = "HIGH" | "MEDIUM" | "LOW";

export interface MessagingActorReferencePayload {
  id: string;
  fullName: string | null;
  email: string;
}

export interface MessagingPatientReferencePayload {
  id: string;
  fullName: string | null;
  birthDate: string | null;
  documentNumber: string | null;
  notes: string | null;
  contacts: Array<{
    type: "PHONE" | "WHATSAPP";
    value: string;
    isPrimary: boolean;
  }>;
}

export interface MessagingThreadListQuery {
  status?: MessageThreadStatus;
  search?: string;
  patientId?: string;
  integrationConnectionId?: string;
}

export interface MessagingHandoffPayload {
  id: string;
  tenantId: string;
  threadId: string;
  status: HandoffStatus;
  source: HandoffSource;
  priority: HandoffPriority;
  reason: string;
  note: string | null;
  closedNote: string | null;
  openedByUserId: string | null;
  assignedToUserId: string | null;
  closedByUserId: string | null;
  openedByUser: MessagingActorReferencePayload | null;
  assignedToUser: MessagingActorReferencePayload | null;
  closedByUser: MessagingActorReferencePayload | null;
  assignedAt: string | null;
  openedAt: string;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MessagingHandoffListQuery {
  status?: HandoffStatus;
  search?: string;
  threadId?: string;
  assignedToUserId?: string;
}

export interface MessagingThreadSummaryPayload {
  id: string;
  tenantId: string;
  patientId: string | null;
  integrationConnectionId: string;
  channel: MessagingChannel;
  status: MessageThreadStatus;
  patientDisplayName: string | null;
  contactDisplayValue: string;
  normalizedContactValue: string;
  lastMessagePreview: string | null;
  lastMessageAt: string | null;
  lastInboundAt: string | null;
  lastOutboundAt: string | null;
  handoffOpen: boolean;
  openHandoff: MessagingHandoffPayload | null;
  createdAt: string;
  updatedAt: string;
}

export interface MessagingThreadDetailPayload extends MessagingThreadSummaryPayload {
  integration: {
    id: string;
    displayName: string;
    provider: MessagingIntegrationProvider;
    phoneNumber: string | null;
      externalAccountId: string | null;
      status: MessagingIntegrationConnectionStatus;
  };
  patient: MessagingPatientReferencePayload | null;
  events: MessagingEventPayload[];
  handoffs: MessagingHandoffPayload[];
}

export interface MessagingHandoffListItemPayload extends MessagingHandoffPayload {
  thread: Pick<
    MessagingThreadSummaryPayload,
    | "id"
    | "status"
    | "patientId"
    | "patientDisplayName"
    | "contactDisplayValue"
    | "lastMessagePreview"
    | "lastMessageAt"
  >;
}

export interface MessagingEventPayload {
  id: string;
  threadId: string;
  patientId: string | null;
  integrationConnectionId: string;
  templateId: string | null;
  webhookEventId: string | null;
  handoffRequestId: string | null;
  actorUserId: string | null;
  direction: MessageEventDirection;
  eventType: MessageEventType;
  providerMessageId: string | null;
  contentText: string | null;
  metadata: Record<string, unknown> | null;
  actorUser: MessagingActorReferencePayload | null;
  occurredAt: string;
  createdAt: string;
}

export interface OpenMessagingHandoffPayload {
  threadId: string;
  reason: string;
  priority?: HandoffPriority;
  note?: string;
  templateId?: string;
  assignedToUserId?: string | null;
}

export interface CloseMessagingHandoffPayload {
  note?: string;
  resolveThread?: boolean;
}

export interface AssignMessagingHandoffPayload {
  assignedToUserId?: string | null;
}

export interface UpdateMessagingThreadPatientPayload {
  patientId: string | null;
}

export interface ResolveMessagingThreadPayload {
  note?: string;
}

export interface SendMessagingThreadMessagePayload {
  text: string;
}

export interface MessagingTemplatePayload {
  id: string;
  tenantId: string;
  channel: MessagingChannel;
  code: string;
  name: string;
  bodyText: string;
  variables: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateMessagingTemplatePayload {
  channel?: MessagingChannel;
  code: string;
  name: string;
  bodyText: string;
  variables?: string[];
}

export interface MessagingIntegrationConnectionPayload {
  id: string;
  tenantId: string;
  channel: MessagingChannel;
  provider: MessagingIntegrationProvider;
  status: MessagingIntegrationConnectionStatus;
  displayName: string;
  phoneNumber: string | null;
  normalizedPhoneNumber: string | null;
  externalAccountId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateMessagingIntegrationConnectionPayload {
  channel?: MessagingChannel;
  provider: MessagingIntegrationProvider;
  displayName: string;
  phoneNumber?: string;
  externalAccountId?: string;
  webhookVerifyToken?: string;
  config?: Record<string, unknown>;
}

export interface CreateMessagingIntegrationConnectionResponsePayload {
  connection: MessagingIntegrationConnectionPayload;
  webhook: {
    path: string;
    verifyToken: string | null;
  };
}

export interface MessagingWhatsappWebhookQuery {
  "hub.mode"?: string;
  "hub.verify_token"?: string;
  "hub.challenge"?: string;
}

export interface MessagingWhatsappWebhookInboundPayload {
  connectionId?: string;
  providerAccountId?: string;
  verifyToken?: string;
  providerEventId?: string;
  providerMessageId?: string;
  eventType?: string;
  senderPhoneNumber: string;
  senderDisplayName?: string;
  messageText?: string;
  occurredAt?: string;
  handoff?: {
    requested?: boolean;
    reason?: string;
    note?: string;
  };
  payload?: Record<string, unknown>;
}

export interface MessagingWhatsappWebhookResponsePayload {
  ok: boolean;
  threadId?: string;
  eventId?: string;
}
