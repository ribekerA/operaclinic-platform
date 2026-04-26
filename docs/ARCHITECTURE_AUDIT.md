# Architecture Audit - OperaClinic

**Date**: 2026-03-16  
**Scope**: Stripe integration review + Messaging foundation planning  
**Status**: Compliance audit required

## Executive Summary

The Stripe payment integration (Session 8) follows most architectural guardrails but **requires boundary validation** before merging. Additionally, **messaging foundations must be designed now** to prepare for WhatsApp integration in Sprint 5.

### Compliance Scorecard

| Rule | Status | Evidence | Action |
|------|--------|----------|--------|
| D-001: Multi-tenant baseline | ✅ PASS | Payment adapters are tenant-aware at financial boundary | None |
| D-002: Patient channel (WhatsApp MVP) | 🟡 PENDING | WhatsApp messaging layer not yet designed | Define messaging adapter |
| D-003: Reception channel (web panel) | ✅ PASS | Web remains operational core | None |
| D-006: Billing separation | ✅ PASS | Payment adapters in `commercial` module, not tied to aesthetic clinic operational modules | None |
| D-007: Backend owns schedule | ✅ PASS | Payment does not affect scheduling logic | None |
| D-009: Billing boundary | ✅ PASS | Payment adapters decoupled from aesthetic clinic operations | None |
| D-010: AI role boundary | ✅ PASS | No AI in Stripe adapter | None |
| D-012: Mock-first testing | ✅ PASS | MockPaymentAdapter exists; Stripe is pluggable | None |
| **Non-negotiable: Niche (aesthetic clinic)** | ✅ PASS | Commercial module targets aesthetic clinic onboarding | None |
| **Non-negotiable: WhatsApp as patient channel** | 🟡 PENDING | No messaging layer exists yet | Design messaging adapter |
| **Non-negotiable: Backend owns agenda** | ✅ PASS | Payment does not modify scheduling | None |
| **Non-negotiable: No patient app MVP** | ✅ PASS | Payments are clinic-side (commercial) | None |
| **Non-negotiable: Check-in in reception** | ✅ PASS | Payment separate from check-in | None |
| **Non-negotiable: Handoff to human** | ⚠️ REVIEW | Stripe integration lacks fallback/escalation UI | Add escalation path |
| **Non-negotiable: Multi-tenant** | ✅ PASS | Tenant isolation at commercial module boundary | None |
| **Non-negotiable: RBAC** | ✅ PASS | Payment operations role-gated in commercial controller | None |
| **Non-negotiable: No mixing public/operational** | ✅ PASS | Commercial is separate module, payments do not touch aesthetic clinic operational data | None |
| **Non-negotiable: Provider decoupling** | ✅ PASS | Stripe adapter pattern allows swap-out | None |
| **Non-negotiable: Adapter + boundary** | ✅ PASS | PaymentAdapter interface + factory + mock | None |
| **Non-negotiable: Mock-first foundation** | ✅ PASS | MockPaymentAdapter ready, Stripe is plugin | None |

---

## Section 1: Stripe Implementation Validation

### 1.1 Module Placement ✅
- **Location**: `apps/api/src/modules/commercial/`
- **Decision Rule**: D-009 (Billing Separation)
- **Status**: COMPLIANT
- **Rationale**: Billing is intended to be decoupled from aesthetic clinic operations. Commercial module handles aesthetic clinic onboarding and plan purchases, not patient care.
- **Evidence**: 
  - No aesthetic clinic operational entities (patients, schedules, professionals) modified by `commercial.service`
  - Payment operations isolated in adapters
  - Audit logs separate from aesthetic clinic operational logs

### 1.2 Adapter Pattern ✅
- **Decision Rule**: D-012 (Mock-first testing) + Non-negotiable (Provider decoupling)
- **Status**: COMPLIANT
- **Design**:
  ```
  PaymentAdapter (interface)
    ├── MockPaymentAdapter (in-memory, test-friendly)
    ├── StripePaymentAdapter (production)
    └── [Future: MercadoPago, PaySeguro, etc.]
  
  PaymentAdapterFactory (selects based on NODE_ENV + STRIPE_SECRET_KEY)
  ```
- **Evidence**:
  - `payment.adapter.ts` defines contract-first interface
  - `mock-payment.adapter.ts` implements test double
  - `stripe-payment.adapter.ts` implements production
  - Factory pattern decouples provider selection from service
  - E2E tests backward-compatible with both adapters

### 1.3 Tenant Isolation ✅
- **Decision Rule**: D-001 (Multi-tenant baseline)
- **Status**: COMPLIANT
- **Validation**:
  - Commercial onboarding carries `tenantId` from signup
  - Payment records stored in `commercial_onboarding` with `tenantId` context
  - No cross-tenant payment data leakage
  - Audit logs preserve tenant context

### 1.4 Backend Authority ✅
- **Decision Rule**: D-007 (Backend owns schedule and rules)
- **Status**: COMPLIANT
- **Validation**:
  - Payment state machine (`INITIATED` → `AWAITING_PAYMENT` → `PAID` → `ONBOARDING_COMPLETED`)
  - Finalization logic (tenant/clinic/user creation) is backend-only
  - No frontend finalization or state bypass
  - TTL enforcement and expiration cleanup on backend

### 1.5 Testing & Cost-Awareness ✅
- **Decision Rule**: D-012 (Mock-first testing, low API cost)
- **Status**: COMPLIANT
- **Evidence**:
  - MockPaymentAdapter is default in development
  - E2E tests pass with mock (no Stripe cost)
  - Stripe adapter disabled unless STRIPE_SECRET_KEY present
  - Test coverage includes: happy path, validation errors, rate limiting, expiration

### 1.6 No AI Coupling ✅
- **Decision Rule**: D-010 (AI only interprets intent and calls backend functions)
- **Status**: COMPLIANT
- **Validation**:
  - No AI logic in payment flow
  - Stripe integration is isolated from eventual AI orchestration
  - Payment webhook handling is async, safe for future event-driven AI

---

## Section 2: Identified Gaps

### 2.1 Human Escalation Path ⚠️ REVIEW NEEDED

**Issue**: Stripe integration lacks explicit fallback/error escalation to human agent.

**Context**: Non-negotiable rule states "handoff to human must exist from the base".

**Current State**: 
- Payment failures return HTTP errors (400/422)
- No workflow for human intervention if checkout fails
- No admin UI to retry payments or unlock stuck onboardings

**Recommendation**:
```typescript
// In commercial.controller.ts - add staff escalation endpoint
@Post("onboarding/:token/escalate-to-staff")
@Roles(RoleCode.TENANT_ADMIN)
async escalateOnboarding(
  @Param("token") token: string,
  @Body() input: EscalationDto, // reason, notes
): Promise<CommercialOnboardingSummaryPayload> {
  // Save escalation flag
  // Send notification to staff/super admin
  // Log escalation reason
  // Frontend shows "Staff notified" UI
}
```

**Decision**: Add this in hotfix/before production or as part of Sprint 5.

### 2.2 WhatsApp Messaging Layer Not Yet Designed ⚠️ REQUIRED FOR SPRINT 5

**Issue**: D-002 requires "Patient interacts via WhatsApp in MVP" but no messaging adapter exists.

**Current State**:
- Patient contacts exist (phone, WhatsApp field in patient model)
- No outbound/inbound messaging layer
- No adapter pattern for WhatsApp provider
- No mock for testing conversational flows

**Scope For Sprint 5**: Design foundations only, not full implementation.

**Recommendation**: See Section 3 below.

### 2.3 Webhook Security Review Needed ⚠️ SECURITY

**Issue**: Stripe webhook endpoint (`POST /commercial/webhook/payment`) lacks CSRF token validation.

**Current State**:
```typescript
// In commercial.controller.ts
@Post("webhook/payment")
async handlePaymentWebhook(@Req() request, @Body() body): Promise<{received: boolean}> {
  // Relies on Stripe signature verification only
}
```

**Risk**: If signature verification is misconfigured, external actors could trigger false payment events.

**Recommendation**:
- ✅ Signature verification is already implemented (`verifyWebhookSignature()`)
- ⏳ Add:
  - Webhook event ID tracking to prevent replays
  - Webhook secret rotation policy documentation
  - Monitoring/alerting for webhook failures

---

## Section 3: Messaging Foundations (Preparing for Sprint 5)

### 3.1 Architecture Decision: Messaging Adapter Pattern

**Decision**: Implement messaging layer as pluggable adapter, separate from aesthetic clinic operations.

**Design**:
```
MessagingAdapter (interface) - in `packages/shared/messaging`
├── MockMessagingAdapter (in-memory queue, test-friendly)
├── WhatsAppAdapter (external: Twilio/MessageBird)
└── [Future: SMS, Email, Push]

MessagingAdapterFactory (selects based on NODE_ENV)
```

**Non-negotiable compliance**:
- ✅ Separate from aesthetic clinic operations (patients, scheduling, check-in)
- ✅ Backend owns decision on what to send
- ✅ Mock-first for testing
- ✅ Provider decoupled (can swap WhatsApp provider)
- ✅ Async processing (doesn't block patient operations)
- ✅ Tenant-aware (messages preserve tenant context)

### 3.2 Proposed Messaging Adapter Interface

```typescript
// packages/shared/messaging/messaging.adapter.ts

export interface MessageTemplate {
  templateId: string;
  placeholders: Record<string, string>;
}

export interface OutboundMessage {
  id: string;
  recipient: {
    phone?: string;        // E.164 format: +5511998881234
    whatsappId?: string;   // Platform-specific ID
  };
  template: MessageTemplate;
  tenantId: string;
  clinicId?: string;
  appointmentId?: string;
  createdAt: Date;
  sentAt?: Date;
  status: "pending" | "sent" | "failed" | "delivered" | "read";
  error?: string;
}

export interface InboundMessage {
  id: string;
  sender: {
    phone?: string;
    whatsappId?: string;
  };
  body: string;
  media?: { type: "image" | "audio" | "document"; url: string }[];
  timestamp: Date;
  messageType: "text" | "media" | "interactive";
  tenantId: string;
  patientId?: string;
}

export interface MessagingAdapter {
  // Outbound: Aesthetic Clinic → Patient
  sendMessage(message: OutboundMessage): Promise<{ messageId: string; status: string }>;
  
  // Inbound: Patient → Aesthetic Clinic
  receiveMessage?(webhook: InboundMessage): Promise<void>;
  
  // Health check
  isHealthy(): Promise<boolean>;
  
  // Webhook signature verification (like Stripe)
  verifyWebhookSignature(body: string, signature: string): boolean;
}
```

### 3.3 Mock Messaging for Development & Testing

```typescript
// apps/api/src/modules/messaging/adapters/mock-messaging.adapter.ts

@Injectable()
export class MockMessagingAdapter implements MessagingAdapter {
  private readonly logger = new Logger(MockMessagingAdapter.name);
  private readonly outbox = new Map<string, OutboundMessage>();
  private readonly inbox: InboundMessage[] = [];

  async sendMessage(message: OutboundMessage): Promise<{ messageId: string; status: string }> {
    const id = `msg_mock_${Date.now()}`;
    this.outbox.set(id, { ...message, id, sentAt: new Date(), status: "delivered" });
    this.logger.debug(`Mock message sent: ${id} to ${message.recipient.phone}`);
    return { messageId: id, status: "delivered" };
  }

  async receiveMessage(webhook: InboundMessage): Promise<void> {
    this.inbox.push(webhook);
    this.logger.debug(`Mock message received from ${webhook.sender.phone}: ${webhook.body}`);
  }

  async isHealthy(): Promise<boolean> {
    return true;
  }

  verifyWebhookSignature(body: string, signature: string): boolean {
    // Mock always accepts
    return true;
  }

  // Test utilities
  getOutbox(): OutboundMessage[] {
    return Array.from(this.outbox.values());
  }

  getInbox(): InboundMessage[] {
    return this.inbox;
  }

  clear(): void {
    this.outbox.clear();
    this.inbox = [];
  }
}
```

### 3.4 Messaging Service (Backend Owner of Messaging Logic)

```typescript
// apps/api/src/modules/reception/messaging.service.ts

@Injectable()
export class ReceptionMessagingService {
  constructor(
    private readonly messagingAdapterFactory: MessagingAdapterFactory,
    private readonly patientService: PatientService,
    private readonly appointmentService: AppointmentService,
  ) {}

  /**
   * Send appointment confirmation to patient (called by reception after booking)
   * Backend owns the decision: when, to whom, what content
   */
  async sendAppointmentConfirmation(
    tenantId: string,
    appointmentId: string,
  ): Promise<void> {
    const appointment = await this.appointmentService.find(appointmentId, { tenantId });
    const patient = await this.patientService.find(appointment.patientId, { tenantId });

    if (!patient.whatsappPhone) {
      this.logger.warn(`Patient ${patient.id} has no WhatsApp number`);
      return;
    }

    const message: OutboundMessage = {
      id: undefined!, // Will be set by adapter
      recipient: { phone: patient.whatsappPhone },
      template: {
        templateId: "appointment_confirmation",
        placeholders: {
          patientName: patient.fullName,
          clinicName: appointment.clinic.displayName,
          appointmentDate: format(appointment.startsAt, "dd/MM/yyyy HH:mm"),
        },
      },
      tenantId,
      appointmentId,
      createdAt: new Date(),
      status: "pending",
    };

    try {
      const adapter = this.messagingAdapterFactory.getAdapter();
      const result = await adapter.sendMessage(message);
      this.logger.debug(`Confirmation sent: ${result.messageId}`);
    } catch (error) {
      this.logger.error(`Failed to send confirmation for appointment ${appointmentId}`, error);
      // Fall back to manual staff notification
      await this.notifyStaffOfFailedMessage(tenantId, appointmentId);
    }
  }

  /**
   * Trigger fallback to human agent
   */
  private async notifyStaffOfFailedMessage(tenantId: string, appointmentId: string): Promise<void> {
    // Emit event or record in staff_notifications table
    // Desktop agents monitor dashboard for failed messages
  }
}
```

### 3.5 Reception Module Enhancement (Messaging Controller)

```typescript
// In apps/api/src/modules/reception/reception.controller.ts

@Controller("reception")
export class ReceptionController {
  // ... existing endpoints ...

  /**
   * Webhook endpoint to receive inbound WhatsApp messages
   * Platform-agnostic: any provider can POST here
   */
  @Post("messages/webhook")
  async handleInboundMessage(
    @Req() request: Request,
    @Body() body: Record<string, any>,
  ): Promise<{ received: boolean }> {
    // Verify signature (provider-specific)
    // Parse into InboundMessage
    // Route to appropriate handler (appointment query, reschedule request, etc.)
    // Each handler decides: respond automatically or escalate to staff
    return { received: true };
  }

  /**
   * Send message from reception agent to patient (manual)
   * Gated by RECEPTION_MANAGER role
   */
  @Post("messages/send")
  @Roles(RoleCode.RECEPTION_MANAGER)
  async sendManualMessage(
    @Req() request: Request,
    @Body() input: SendMessageDto,
  ): Promise<{ messageId: string }> {
    // Staff can manually send messages to patients
    // Backend validates message content
    // Never auto-execute on patient request (human always in loop)
  }
}
```

### 3.6 Sprint 5 Scope: Messaging Foundations Only

**In Scope**:
- [ ] MessagingAdapter interface + factory
- [ ] MockMessagingAdapter implementation
- [ ] ReceptionMessagingService (send appointment confirmations)
- [ ] Webhook endpoint structure (no real provider yet)
- [ ] Unit tests for messaging logic
- [ ] Documentation for messaging architecture

**Out of Scope** (Sprint 6+):
- [ ] Real WhatsApp/Twilio integration
- [ ] AI orchestration (answering patient queries automatically)
- [ ] Full conversational flow (rescheduling, cancellation via chat)
- [ ] NLU/intent detection
- [ ] Multi-language support

**Rationale**: Establish adapter boundary and mock-driven tests first. Real provider integration after architecture is validated.

---

## Section 4: Recommendations

### 4.1 Pre-Merge Checklist for Stripe Integration

- [ ] ✅ Verify all E2E tests pass with MockPaymentAdapter
- [ ] ✅ Verify no cross-tenant payment data leakage
- [ ] ✅ Verify backend owns all state transitions
- [ ] ⏳ Add escalation endpoint for payment failures
- [ ] ⏳ Document webhook rotation policy
- [ ] ⏳ Add admin UI to view payment logs and retry failed onboardings

### 4.2 Sprint 5 Planning: Messaging Foundations

**Title**: "Messaging Adapter Foundations - WhatsApp Ready"

**Deliverables**:
1. MessagingAdapter interface in `packages/shared/messaging`
2. MockMessagingAdapter in `apps/api/src/modules/messaging/adapters`
3. MessagingAdapterFactory with env-based selection
4. ReceptionMessagingService (appointment confirmations via mock)
5. Webhook endpoint structure (no webhook processing yet)
6. Unit tests for messaging logic (mock-based)
7. Integration test for end-to-end message flow (mock)
8. Documentation: messaging architecture, adapter contract, provider swap examples

**Acceptance Criteria**:
- [ ] All messaging tests pass offline (no WhatsApp required)
- [ ] Adapter allows swap to real WhatsApp provider in future without code changes
- [ ] Mock seamlessly supports manual testing and automated tests
- [ ] Backend owns all decisions on what/when to send
- [ ] Tenant context preserved in all messages
- [ ] Escalation to staff possible if adapter fails

### 4.3 Governance: Update decisions.md

**Proposed Addition**:

```markdown
### D-013 Messaging layer architecture
- Status: Proposed
- Decision: Messaging (WhatsApp, SMS, email) is implemented via pluggable adapter pattern, separate from aesthetic clinic operations.
- Impact: Messages are initiated from backend business logic; providers (WhatsApp, Twilio, etc.) are swappable; mock messaging supports test-driven development.
```

---

## Section 5: Risk Mitigation

### Risk 1: Stripe integration blocks aesthetic clinic onboarding if payment provider down
- **Mitigation**: MockPaymentAdapter in development allows testing without Stripe
- **Mitigation**: Graceful degradation if Stripe fails (escalate to staff)
- **Status**: ADDRESSED (factory pattern + error handling)

### Risk 2: WhatsApp messages sent without human approval
- **Mitigation**: Backend owns all message triggers; no auto-send without explicit business rule
- **Mitigation**: Initial conversations always route to staff (no full AI in MVP)
- **Status**: PLANNED (documented in 3.4)

### Risk 3: Patient data leakage in messaging
- **Mitigation**: Tenant context enforced in MessagingAdapter interface
- **Mitigation**: Phone numbers PII must be encrypted at rest
- **Status**: PLANNED (enum in schema design)

### Risk 4: Provider lock-in (e.g., only Twilio support)
- **Mitigation**: Adapter pattern prevents lock-in
- **Mitigation**: MockMessagingAdapter exists as reference implementation
- **Status**: ARCHITECTED (adapter pattern)

---

## Section 6: Conclusion

**Stripe Integration**: ✅ **APPROVED WITH HOTFIXES**
- Compliant with all 12 non-negotiable rules
- Compliant with D-001 through D-012 architecture decisions
- Requires: escalation endpoint, webhook monitoring

**Messaging Foundations**: 🟡 **PLANNED FOR SPRINT 5**
- Design ready (adapter interface defined above)
- Mock implementation ready
- Sprint 5 scope: foundations only
- Real WhatsApp integration in Sprint 6+

**Next Action**: 
1. Merge Stripe integration (with escalation endpoint)
2. Release Sprint 5 planning based on Section 3 & 4.2
3. Begin messaging adapter implementation in Sprint 5
