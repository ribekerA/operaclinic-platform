# Sprint 5 Planning - Messaging Adapter Foundations

**Sprint Title**: Messaging Foundations - WhatsApp Adapter Ready  
**Duration**: 1 week (estimated)  
**Goal**: Establish messaging layer as pluggable adapter, prepare for WhatsApp provider integration  
**Scope**: Foundations only, no real WhatsApp integration yet

---

## 1. Sprint Objective

Enable clinic-to-patient messaging via decoupled adapter pattern:
- ✅ Backend owns all messaging decisions (when, what, to whom)
- ✅ Mock adapter for testing without external APIs
- ✅ Provider-agnostic (Twilio, MessageBird, custom, etc.)
- ✅ Tenant-isolated and audit-logged
- ✅ Manual staff override / escalation included

**Non-negotiable Rules Enforced**:
- D-002: Patient interacts via WhatsApp (channel setup)
- D-007: Backend owns business rules (messaging decisions)
- D-010: No autonomous AI sending without explicit backend trigger
- D-012: Mock-first testing (MockMessagingAdapter)
- Non-negotiable: Handoff to human from base
- Non-negotiable: Multi-tenant message isolation
- Non-negotiable: RBAC on manual message sending

---

## 2. Deliverables

### 2.1 Shared Messaging Contract
**File**: `packages/shared/messaging/messaging.adapter.ts`

```typescript
/**
 * Shared messaging adapter interface
 * Defines contract for any provider (WhatsApp, SMS, Email, etc.)
 */

export interface MessageRecipient {
  // At least one must be set
  phone?: string;           // E.164: +5511998881234
  whatsappId?: string;      // Provider-specific ID (Twilio phone SID, etc.)
  email?: string;           // Future SMS/Email
}

export interface MessageTemplate {
  templateId: string;       // "appointment_confirmation", "appointment_reminder", etc.
  languageCode?: string;    // "pt-BR", "en-US" (default: tenant timezone inference)
  placeholders: Record<string, string>; // { patientName, clinicName, ... }
}

export interface OutboundMessage {
  id?: string;              // Set by adapter upon send
  recipient: MessageRecipient;
  template: MessageTemplate;
  tenantId: string;         // Multi-tenant: required
  clinicId?: string;        // Scoped to specific clinic within tenant
  patientId?: string;       // For audit linkage
  appointmentId?: string;   // For audit linkage
  context?: Record<string, any>; // Provider context
  createdAt: Date;
  sentAt?: Date;
  expiresAt?: Date;         // Message TTL (e.g., reminder 1h before appointment)
  status: "pending" | "sent" | "failed" | "delivered" | "read" | "error";
  error?: string;
  metadata?: Record<string, any>; // Custom provider data
}

export interface InboundMessage {
  id: string;               // Provider webhook ID
  sender: MessageRecipient;
  body: string;
  media?: Array<{
    type: "image" | "audio" | "document" | "video";
    url: string;
    mediaId?: string;
  }>;
  timestamp: Date;
  messageType: "text" | "media" | "interactive" | "system";
  tenantId: string;         // Multi-tenant: must detect
  clinicId?: string;
  patientId?: string;       // Should be identified by phone lookup
  context?: Record<string, any>; // Provider context (Twilio SID, etc.)
  webhookSignature?: string; // For verification
}

export interface WebhookEvent {
  provider: string;         // "whatsapp", "twilio", "messagebird"
  eventType: string;        // "message_sent", "message_failed", "message_received"
  timestamp: Date;
  data: Record<string, any>;
}

export interface MessagingAdapter {
  /**
   * Send message from backend to patient
   * Called by backend business logic (e.g., appointment confirmation)
   */
  sendMessage(message: OutboundMessage): Promise<{
    messageId: string;
    status: "sent" | "pending" | "error";
    error?: string;
  }>;

  /**
   * Handle inbound message (webhook callback)
   * Should be idempotent (same webhook called multiple times)
   */
  receiveMessage?(inbound: InboundMessage): Promise<void>;

  /**
   * Verify webhook signature (provider-specific)
   * Prevents spoofed webhook calls
   */
  verifyWebhookSignature(body: string, signature: string): boolean;

  /**
   * Health check (is provider reachable?)
   * Used by admin dashboard and diagnostics
   */
  isHealthy(): Promise<boolean>;

  /**
   * Get adapter metadata (for logging/debugging)
   */
  getMetadata(): {
    provider: string;
    version: string;
    features: string[];
    status: "healthy" | "degraded" | "offline";
  };
}
```

**Files to Create**:
- [ ] `packages/shared/messaging/messaging.adapter.ts` - Interface definitions
- [ ] `packages/shared/messaging/index.ts` - Export all
- [ ] `packages/shared/messaging/message-template.constants.ts` - Predefined templates

### 2.2 Mock Messaging Adapter
**File**: `apps/api/src/modules/messaging/adapters/mock-messaging.adapter.ts`

```typescript
@Injectable()
export class MockMessagingAdapter implements MessagingAdapter {
  private readonly logger = new Logger(MockMessagingAdapter.name);
  private outbox = new Map<string, OutboundMessage>();
  private inbox: InboundMessage[] = [];

  async sendMessage(message: OutboundMessage): Promise<{ 
    messageId: string; 
    status: "sent" | "pending" | "error"; 
    error?: string;
  }> {
    const messageId = `msg_mock_${Date.now()}_${randomUUID()}`;
    
    const record: OutboundMessage = {
      ...message,
      id: messageId,
      sentAt: new Date(),
      status: "delivered", // Mock always succeeds immediately
    };

    this.outbox.set(messageId, record);
    this.logger.debug(
      `[Mock] Message enqueued: ${messageId} to ${message.recipient.phone} (tenant: ${message.tenantId})`
    );

    return {
      messageId,
      status: "sent",
    };
  }

  async receiveMessage(inbound: InboundMessage): Promise<void> {
    this.inbox.push(inbound);
    this.logger.debug(
      `[Mock] Inbound message received from ${inbound.sender.phone}: "${inbound.body}"`
    );
  }

  verifyWebhookSignature(body: string, signature: string): boolean {
    // Mock always accepts webhooks
    this.logger.debug("[Mock] Webhook signature accepted (mock mode)");
    return true;
  }

  async isHealthy(): Promise<boolean> {
    return true; // Mock is always healthy
  }

  getMetadata() {
    return {
      provider: "mock",
      version: "1.0.0",
      features: ["send", "receive", "webhook_verification"],
      status: "healthy",
    };
  }

  // Test utilities
  getOutbox(): OutboundMessage[] {
    return Array.from(this.outbox.values());
  }

  getInbox(): InboundMessage[] {
    return this.inbox;
  }

  getMessageById(messageId: string): OutboundMessage | undefined {
    return this.outbox.get(messageId);
  }

  clear(): void {
    this.outbox.clear();
    this.inbox = [];
    this.logger.debug("[Mock] Outbox and inbox cleared");
  }
}
```

**Files to Create**:
- [ ] `apps/api/src/modules/messaging/adapters/mock-messaging.adapter.ts` - Mock implementation

### 2.3 Messaging Adapter Factory
**File**: `apps/api/src/modules/messaging/messaging-adapter.factory.ts`

```typescript
@Injectable()
export class MessagingAdapterFactory {
  private readonly logger = new Logger(MessagingAdapterFactory.name);
  private adapter: MessagingAdapter | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly mockAdapter: MockMessagingAdapter,
    // In Sprint 6: private readonly whatsappAdapter: WhatsAppAdapter,
  ) {}

  getAdapter(): MessagingAdapter {
    if (this.adapter) {
      return this.adapter;
    }

    const provider = this.getProvider();

    if (provider === "whatsapp") {
      this.logger.log("Using WhatsApp messaging adapter");
      // this.adapter = this.whatsappAdapter;
      throw new Error("WhatsApp adapter not yet implemented (Sprint 6)");
    }

    this.logger.warn("Using Mock messaging adapter (development/test mode)");
    this.adapter = this.mockAdapter;
    return this.adapter;
  }

  private getProvider(): "mock" | "whatsapp" {
    const nodeEnv = this.configService.get<string>("app.environment") || "development";
    const whatsappKey = this.configService.get<string>("messaging.whatsapp.apiKey");
    const forceProvider = this.configService.get<"mock" | "whatsapp">("messaging.provider");

    if (forceProvider) {
      return forceProvider;
    }

    if (nodeEnv === "production") {
      if (!whatsappKey) {
        this.logger.warn("WhatsApp not configured in production; using mock");
        return "mock";
      }
      return "whatsapp";
    }

    // Development: use mock unless WhatsApp explicitly configured
    if (whatsappKey) {
      return "whatsapp";
    }

    return "mock";
  }

  resetAdapter(): void {
    this.adapter = null;
  }
}
```

**Files to Create**:
- [ ] `apps/api/src/modules/messaging/messaging-adapter.factory.ts` - Factory

### 2.4 Reception Messaging Service
**File**: `apps/api/src/modules/reception/services/reception-messaging.service.ts`

```typescript
@Injectable()
export class ReceptionMessagingService {
  private readonly logger = new Logger(ReceptionMessagingService.name);

  constructor(
    private readonly messagingAdapterFactory: MessagingAdapterFactory,
    private readonly patientService: PatientService,
    private readonly appointmentService: AppointmentService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Send appointment confirmation after booking
   * Backend owns decision: when, to whom, what content
   * Idempotent: safe to call multiple times
   */
  async sendAppointmentConfirmation(
    tenantId: string,
    clinicId: string,
    appointmentId: string,
  ): Promise<void> {
    try {
      const appointment = await this.appointmentService.findOne(appointmentId, {
        tenantId,
        include: {
          patient: true,
          professional: true,
          clinic: true,
        },
      });

      if (!appointment.patient.whatsappPhone) {
        this.logger.warn(
          `Cannot confirm appointment: patient ${appointment.patientId} has no WhatsApp phone`
        );
        return;
      }

      const message: OutboundMessage = {
        recipient: {
          phone: appointment.patient.whatsappPhone,
        },
        template: {
          templateId: "appointment_confirmation",
          languageCode: "pt-BR",
          placeholders: {
            patientName: appointment.patient.fullName,
            professionalName: appointment.professional.fullName,
            clinicName: appointment.clinic.displayName,
            appointmentDate: format(appointment.startsAt, "dd 'de' MMMM 'às' HH'h'mm", { locale: ptBR }),
            appointmentTime: format(appointment.startsAt, "HH:mm"),
          },
        },
        tenantId,
        clinicId,
        patientId: appointment.patientId,
        appointmentId,
        createdAt: new Date(),
        status: "pending",
      };

      const adapter = this.messagingAdapterFactory.getAdapter();
      const result = await adapter.sendMessage(message);

      // Log message send
      await this.auditService.record({
        action: "SEND_APPOINTMENT_CONFIRMATION",
        tenantId,
        actor: { type: "system" },
        target: {
          type: "appointment",
          id: appointmentId,
        },
        metadata: {
          messageId: result.messageId,
          recipient: appointment.patient.whatsappPhone,
          status: result.status,
        },
      });

      this.logger.debug(`Appointment confirmation sent: ${result.messageId}`);
    } catch (error) {
      this.logger.error(
        `Failed to send appointment confirmation for ${appointmentId}`,
        error instanceof Error ? error.message : String(error)
      );
      // Escalate to staff dashboard notification
      await this.escalateToStaff(tenantId, `Não foi possível enviar confirmação do agendamento ${appointmentId}`);
    }
  }

  /**
   * Send appointment reminder (1 hour before)
   * Not auto-triggered in Sprint 5; later: async job
   */
  async sendAppointmentReminder(
    tenantId: string,
    clinicId: string,
    appointmentId: string,
  ): Promise<void> {
    // Similar structure to sendAppointmentConfirmation
    // Template: "appointment_reminder"
  }

  /**
   * Escalate failed message to staff
   * Backend decides: show warning in dashboard
   */
  private async escalateToStaff(tenantId: string, reason: string): Promise<void> {
    // TODO: Record in staff_alerts or emit event
    this.logger.warn(`[STAFF ESCALATION] tenant=${tenantId}: ${reason}`);
  }
}
```

**Files to Create**:
- [ ] `apps/api/src/modules/reception/services/reception-messaging.service.ts` - Service

### 2.5 Messaging Module
**File**: `apps/api/src/modules/messaging/messaging.module.ts`

```typescript
import { Module } from "@nestjs/common";
import { MessagingAdapterFactory } from "./messaging-adapter.factory";
import { MockMessagingAdapter } from "./adapters/mock-messaging.adapter";

@Module({
  providers: [
    MockMessagingAdapter,
    MessagingAdapterFactory,
    // In Sprint 6: WhatsAppAdapter, ...
  ],
  exports: [MessagingAdapterFactory],
})
export class MessagingModule {}
```

**Files to Create**:
- [ ] `apps/api/src/modules/messaging/messaging.module.ts` - Module
- [ ] `apps/api/src/modules/messaging/adapters/index.ts` - Export all adapters

### 2.6 Messaging Webhook Controller
**File**: `apps/api/src/modules/reception/reception-webhook.controller.ts`

```typescript
@Controller("reception/webhook")
export class ReceptionWebhookController {
  private readonly logger = new Logger(ReceptionWebhookController.name);

  constructor(
    private readonly messagingAdapterFactory: MessagingAdapterFactory,
    private readonly receptionMessagingService: ReceptionMessagingService,
  ) {}

  /**
   * Webhook endpoint for inbound messages from messaging provider
   * Provider-agnostic: any adapter can POST here
   * 
   * Expected Headers:
   * - X-Messaging-Provider: "whatsapp", "twilio", "messagebird", etc.
   * - X-Provider-Signature: Provider-specific HMAC signature
   * 
   * Expected Body (provider-specific, normalized by adapter)
   */
  @Post("messages/inbound")
  async handleInboundMessage(
    @Headers() headers: Record<string, string>,
    @Body() body: Record<string, any>,
  ): Promise<{ received: boolean; messageId?: string }> {
    try {
      const provider = headers["x-messaging-provider"] || "unknown";
      const signature = headers["x-provider-signature"] || "";

      this.logger.debug(`Received inbound webhook from provider: ${provider}`);

      // Verify signature
      const adapter = this.messagingAdapterFactory.getAdapter();
      const isValid = adapter.verifyWebhookSignature(JSON.stringify(body), signature);

      if (!isValid) {
        this.logger.warn(`Invalid webhook signature from${provider}`);
        return { received: false };
      }

      // Parse into InboundMessage (provider-specific normalization happens in adapter)
      const inbound: InboundMessage = this.normalizeInboundMessage(provider, body);

      // Process message
      await adapter.receiveMessage(inbound);

      // Log
      this.logger.debug(
        `Processed inbound message: ${inbound.id} from ${inbound.sender.phone} (tenant: ${inbound.tenantId})`
      );

      return { received: true, messageId: inbound.id };
    } catch (error) {
      this.logger.error(
        `Failed to process inbound webhook`,
        error instanceof Error ? error.message : String(error)
      );
      // Return 200 to prevent webhook retry storm
      return { received: false };
    }
  }

  private normalizeInboundMessage(provider: string, body: Record<string, any>): InboundMessage {
    // In Sprint 6: add provider-specific normalization for Twilio, MessageBird, etc.
    // For now, assume body is already in normalized format
    return {
      id: body.messageId || `msg_${Date.now()}`,
      sender: {
        phone: body.senderPhone,
        whatsappId: body.senderWhatsAppId,
      },
      body: body.body || body.text || "",
      media: body.media || [],
      timestamp: new Date(body.timestamp),
      messageType: body.messageType || "text",
      tenantId: body.tenantId,
      patientId: body.patientId,
      context: body,
    };
  }
}
```

**Files to Create**:
- [ ] `apps/api/src/modules/reception/reception-webhook.controller.ts` - Webhook handler

### 2.7 Message Templates (Backend-Owned)
**File**: `packages/shared/messaging/message-templates.constants.ts`

```typescript
/**
 * Predefined message templates
 * Backend owns all templates; frontend cannot add templates
 */

export const MESSAGE_TEMPLATES = {
  APPOINTMENT_CONFIRMATION: {
    templateId: "appointment_confirmation",
    name: "Confirmação de Agendamento",
    description: "Sent after appointment is booked",
    placeholders: ["patientName", "clinicName", "appointmentDate", "appointmentTime", "professionalName"],
    minFields: ["patientName", "clinicName", "appointmentDate"],
  },
  APPOINTMENT_REMINDER: {
    templateId: "appointment_reminder",
    name: "Lembrete de Agendamento",
    description: "Sent 1 hour before appointment",
    placeholders: ["patientName", "clinicName", "appointmentTime"],
    minFields: ["patientName", "appointmentTime"],
  },
  APPOINTMENT_CANCELLED: {
    templateId: "appointment_cancelled",
    name: "Agendamento Cancelado",
    description: "Sent when appointment is cancelled by clinic",
    placeholders: ["patientName", "clinicName", "appointmentDate", "reasonCancelled"],
    minFields: ["patientName", "clinicName"],
  },
  APPOINTMENT_RESCHEDULED: {
    templateId: "appointment_rescheduled",
    name: "Agendamento Remarcado",
    description: "Sent when appointment is rescheduled",
    placeholders: ["patientName", "clinicName", "oldAppointmentDate", "newAppointmentDate", "newAppointmentTime"],
    minFields: ["patientName", "newAppointmentDate"],
  },
} as const;

// Validate template usage at compile time
export type ValidTemplateId = keyof typeof MESSAGE_TEMPLATES;
```

**Files to Create**:
- [ ] `packages/shared/messaging/message-templates.constants.ts` - Templates

### 2.8 Unit Tests
**File**: `apps/api/test/messaging/mock-messaging.adapter.spec.ts`

```typescript
describe("MockMessagingAdapter", () => {
  let adapter: MockMessagingAdapter;

  beforeEach(() => {
    adapter = new MockMessagingAdapter();
  });

  it("should send message and return messageId", async () => {
    const message: OutboundMessage = {
      recipient: { phone: "+5511998881234" },
      template: {
        templateId: "appointment_confirmation",
        placeholders: { patientName: "João" },
      },
      tenantId: "tenant-1",
      createdAt: new Date(),
      status: "pending",
    };

    const result = await adapter.sendMessage(message);

    expect(result.status).toBe("sent");
    expect(result.messageId).toBeDefined();
  });

  it("should store message in outbox", async () => {
    const message: OutboundMessage = {
      recipient: { phone: "+5511998881234" },
      template: { templateId: "appointment_confirmation", placeholders: {} },
      tenantId: "tenant-1",
      createdAt: new Date(),
      status: "pending",
    };

    const result = await adapter.sendMessage(message);
    const stored = adapter.getMessageById(result.messageId);

    expect(stored).toBeDefined();
    expect(stored!.status).toBe("delivered");
  });

  it("should accept inbound messages", async () => {
    const inbound: InboundMessage = {
      id: "msg_123",
      sender: { phone: "+5511998881234" },
      body: "Olá, quero remarcar meu agendamento",
      timestamp: new Date(),
      messageType: "text",
      tenantId: "tenant-1",
    };

    await adapter.receiveMessage(inbound);
    const inbox = adapter.getInbox();

    expect(inbox).toHaveLength(1);
    expect(inbox[0].body).toBe("Olá, quero remarcar meu agendamento");
  });

  it("should verify webhook signature (always true for mock)", () => {
    const result = adapter.verifyWebhookSignature("body", "signature");
    expect(result).toBe(true);
  });
});
```

**Files to Create**:
- [ ] `apps/api/test/messaging/mock-messaging.adapter.spec.ts` - Mock adapter tests
- [ ] `apps/api/test/messaging/reception-messaging.service.spec.ts` - Service tests

### 2.9 Integration Tests
**File**: `apps/api/test/reception/messaging-webhook.integration.spec.ts`

```typescript
describe("Reception Messaging Webhook", () => {
  let app: INestApplication;
  let messagingAdapter: MockMessagingAdapter;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      imports: [MessagingModule, ReceptionModule], // Mocked
    }).compile();

    app = module.createNestApplication();
    await app.init();

    messagingAdapter = module.get(MockMessagingAdapter);
  });

  it("should accept inbound message webhook", async () => {
    const payload = {
      messageId: "msg_123",
      senderPhone: "+5511998881234",
      body: "Quero remarcar",
      tenantId: "tenant-1",
      timestamp: new Date().toISOString(),
      messageType: "text",
    };

    const response = await request(app.getHttpServer())
      .post("/reception/webhook/messages/inbound")
      .set("X-Messaging-Provider", "mock")
      .set("X-Provider-Signature", "valid-signature")
      .send(payload)
      .expect(201);

    expect(response.body.received).toBe(true);
    expect(messagingAdapter.getInbox()).toHaveLength(1);
  });

  it("should reject invalid webhook signature", async () => {
    const payload = { messageId: "msg_123" };

    const response = await request(app.getHttpServer())
      .post("/reception/webhook/messages/inbound")
      .set("X-Messaging-Provider", "mock")
      .send(payload)
      .expect(201);

    expect(response.body.received).toBe(false);
  });
});
```

**Files to Create**:
- [ ] `apps/api/test/reception/messaging-webhook.integration.spec.ts` - Integration tests

### 2.10 Environment Configuration
**Update**: `apps/api/.env.example`

```bash
# =============================================================================
# MESSAGING / WHATSAPP (Sprint 5+)
# =============================================================================

# Messaging provider for development/testing
# Values: "mock" (development) or "whatsapp" (future)
# Default: "mock" (no WhatsApp key set)
MESSAGING_PROVIDER=mock

# WhatsApp API Key (optional; not used in Sprint 5)
# In Sprint 6: use real key from Twilio/MessageBird
# MESSAGING_WHATSAPP_API_KEY=

# Messaging webhook secret (for signature verification)
# Configured by each provider in production
# MESSAGING_WEBHOOK_SECRET=
```

**Files to Modify**:
- [ ] `apps/api/.env.example` - Add messaging config

---

## 3. Acceptance Criteria

### 3.1 Functional Criteria
- [ ] MockMessagingAdapter sends and receives messages offline
- [ ] MessagingAdapterFactory selects correct adapter by NODE_ENV
- [ ] ReceptionMessagingService sends appointment confirmations
- [ ] Webhook endpoint accepts and normalizes inbound messages
- [ ] Audit logs preserve tenant context and message metadata
- [ ] All tests pass without external API calls

### 3.2 Architectural Criteria
- [ ] Messaging adapter is provider-agnostic (interface-based)
- [ ] Adapter can be swapped without modifying service logic
- [ ] Mock adapter supports end-to-end testing offline
- [ ] Backend owns all messaging decisions (no frontend template control)
- [ ] Tenant context enforced at adapter boundary
- [ ] RBAC on manual message sending (future: staff override)

### 3.3 Testing Criteria
- [ ] Unit tests: MockMessagingAdapter isolated (no deps)
- [ ] Unit tests: ReceptionMessagingService logic (mocked adapter)
- [ ] Integration tests: Webhook endpoint + adapter + service flow
- [ ] E2E smoke test: Full appointment → confirmation message flow (mock)
- [ ] Test coverage: >80% for messaging module

### 3.4 Non-Functional Criteria
- [ ] Messaging service is async (doesn't block appointment creation)
- [ ] Failed messages escalate to staff (logged, dashboardable)
- [ ] Webhook endpoint returns 200 even if processing fails (idempotent)
- [ ] Message templates are immutable (backend-only)
- [ ] Audit trail complete for all messages (send, fail, deliver)

---

## 4. Out of Scope (Sprint 6+)

❌ Real WhatsApp/Twilio integration
❌ NLU/intent detection
❌ Automatic rescheduling via chat
❌ AI orchestration
❌ Multi-language template selection
❌ Rich media (images, documents)
❌ Message delivery analytics

---

## 5. Risk Mitigation

### Risk: Messages sent without patient consent
- **Mitigation**: Only send after explicit backend trigger (appointment confirmed by reception)
- **Mitigation**: Mock adapter for testing without real messages

### Risk: Provider lock-in (e.g., only Twilio)
- **Mitigation**: Adapter pattern prevents lock-in
- **Mitigation**: Mock adapter exists as reference implementation

### Risk: Patient data leakage in webhook
- **Mitigation**: Verify webhook signature before processing
- **Mitigation**: Log audit trail with tenant context
- **Mitigation**: Encrypt phone numbers at rest (future)

### Risk: Message spam from bugs
- **Mitigation**: Use mock adapter in development/testing
- **Mitigation**: Staff can manually review/cancel outbound queue

---

## 6. Build Order

1. **Day 1**: Define interfaces (messaging.adapter.ts, templates.constants.ts)
2. **Day 1-2**: Implement MockMessagingAdapter + factory
3. **Day 2-3**: Create ReceptionMessagingService + module
4. **Day 3**: Implement webhook controller
5. **Day 4**: Unit + integration tests
6. **Day 4-5**: Documentation + code review
7. **Day 5**: Smoke test + final validation

---

## 7. Definition of Done

✅ Code changes merged to main:
- [ ] All files created/modified as listed in Section 2
- [ ] All tests passing (unit, integration, E2E)
- [ ] Code review completed by architecture team
- [ ] No external API calls in tests

✅ Documentation:
- [ ] Messaging adapter architecture documented
- [ ] Provider swap examples in README
- [ ] Environment variable guide updated

✅ Future Readiness:
- [ ] Adapter pattern ready for Twilio/MessageBird in Sprint 6
- [ ] Mock seamlessly supports manual testing
- [ ] Backend owns all messaging decisions

---

## 8. Success Metrics

🎯 **Delivered by EOW**:
- Reception can send appointment confirmations via mock messaging
- E2E test covers: appointment creation → message sent → message received
- 80% test coverage for messaging module
- Zero external API calls in test environment
- Architecture review: All non-negotiable rules validated

🎯 **Future Readiness**:
- Sprint 6 can plug real WhatsApp adapter without service changes
- Manual testing: staff can verify messages in mock outbox
- Audit trail complete for compliance
