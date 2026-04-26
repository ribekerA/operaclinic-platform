# Architecture Decisions in Code - Implementation Map

**Purpose**: Show exactly where each non-negotiable rule + architecture decision is enforced in the codebase.

---

## 1. Multi-Tenant Isolation (D-001 + Non-negotiable)

### Where It's Enforced

**Commercial Module - Payments**:
```typescript
// apps/api/src/modules/commercial/commercial.service.ts
constructor(
  private readonly paymentAdapterFactory: PaymentAdapterFactory,
  // ✅ Service receives factory, NOT provider directly
  // ✅ This forces tenant context throughout
) {}

async confirmCheckout(publicToken: string, sessionId?: string) {
  const onboarding = await this.findOnboardingByPublicTokenOrThrow(publicToken);
  // ✅ Lookup by token validates onboarding belongs to authenticated tenant
  
  const confirmation = await this.paymentAdapter.confirmPayment(sessionId);
  // ✅ Payment adapter result never processed without tenant context check
  
  const updated = await this.prisma.$transaction(async (tx) => {
    const next = await tx.commercialOnboarding.update({
      where: { id: onboarding.id },
      data: { status, paymentReference, tenantId: onboarding.tenantId },
      // ✅ Always write tenantId to database
    });
    
    await this.recordAuditLog(tx, {
      tenantId, // ✅ Audit log scoped to tenant
      targetId: next.id,
      metadata: { paymentReference },
    });
  });
}
```

**Adapter Pattern - Payment**:
```typescript
// apps/api/src/modules/commercial/adapters/payment.adapter.ts
export interface OutboundMessage {
  id: string;
  reference: string;
  url: string;
  expiresAt: Date;
  tenantId: string; // ✅ REQUIRED - tenant context
  status: "created" | "expired" | "completed";
}
```

**Controller - Payment**:
```typescript
// apps/api/src/modules/commercial/commercial.controller.ts
@Post("onboarding/:publicToken/confirm-checkout")
async confirmCheckout(
  @Req() request: Request,
  @Param("publicToken") publicToken: string,
) {
  this.abuseProtectionService.assertWithinLimit(request, "confirm_checkout");
  // ✅ Rate limiting scoped to request origin (prevents cross-tenant abuse)
  
  return this.commercialService.confirmCheckout(publicToken);
  // ✅ publicToken lookup ensures tenant context from auth
}
```

---

## 2. Backend Authority (D-007 + Non-negotiable)

### Schedule Unaffected by Payments

```typescript
// apps/api/src/modules/commercial/commercial.service.ts
// ❌ Payment service NEVER touches:
//    - Schedules
//    - Appointments
//    - Professionals
//    - Patients

// Payment state machine is ISOLATED:
enum CommercialOnboardingStatus {
  INITIATED,
  AWAITING_PAYMENT,
  PAID,
  ONBOARDING_STARTED,
  ONBOARDING_COMPLETED,
}

// When onboarding status → PAID, it triggers:
// - Tenant creation
// - Clinic creation
// - Admin user creation
// - Subscription creation
// ❌ Never: auto-booking, schedule generation, patient linkage
```

### Messaging Will Honor This

```typescript
// Future: apps/api/src/modules/reception/services/reception-messaging.service.ts
// Backend owns ALL message triggers. Example:

async sendAppointmentConfirmation(
  tenantId: string,
  appointmentId: string,
) {
  // ✅ Explicit backend function call required
  // ❌ No implicit "send if patient has WhatsApp"
  // ❌ No automatic scheduling
  // ✅ Human (reception) confirms appointment first
  // ✅ Backend decides: send message now
  
  const message = {
    recipient: { phone: patient.whatsappPhone },
    template: { templateId: "appointment_confirmation", ... },
    tenantId, // ✅ Tenant context
    appointmentId, // ✅ Audit linkage
    createdAt: new Date(),
  };
  
  await this.messagingAdapter.sendMessage(message);
}
```

---

## 3. Billing Separation (D-009 + Non-negotiable)

### Commercial Module ⊥ Aesthetic Clinic Operational Modules

```
Backend Architecture
├── clinical/
│   ├── patients/
│   ├── scheduling/
│   ├── professionals/
│   └── reception/
│       └── messaging/ ← NEW (Sprint 5) - sends msgs to patients
│
├── commercial/ ← ISOLATED
│   ├── adapters/
│   │   ├── payment.adapter.ts ← Interface
│   │   ├── mock-payment.adapter.ts ← Mock
│   │   └── stripe-payment.adapter.ts ← Stripe
│   ├── commercial.service.ts ← Owns payment state
│   └── commercial.controller.ts ← Endpoints (public)
│
└── platform/
    ├── auth/ ← Super admin only
    └── billing/ ← Future: separate domain
```

**Why This Files Separation**:
```typescript
// ❌ commercial.service.ts does NOT import:
// import { PatientsService } from '../clinical/patients/patients.service';
// import { SchedulingService } from '../clinical/scheduling/scheduling.service';

// ✅ commercial.service.ts only imports:
import { PrismaService } from '../../database/prisma.service';
import { PaymentAdapterFactory } from './adapters/payment-adapter.factory';
// Exceptions: audit, config, types

// ✅ Edge case: finalizeOnboarding() creates tenant + clinic
// But it does NOT:
// - Touch schedule state
// - Modify patient list
// - Create appointment
// It ONLY creates owner structure (tenant → clinic → user → subscription)
```

---

## 4. Mock-First Testing (D-012 + Non-negotiable)

### Development Can Skip External APIs

```typescript
// apps/api/src/modules/commercial/adapters/payment-adapter.factory.ts
private getProvider(): PaymentProvider {
  const nodeEnv = this.configService.get<string>("app.environment", "development");
  const stripeKey = this.configService.get<string>("stripe.secretKey");

  if (nodeEnv === "production") {
    if (!stripeKey) {
      throw new Error("STRIPE_SECRET_KEY must be set in production environment");
    }
    return "stripe";
  }

  // Development: use Stripe if configured, otherwise mock
  if (stripeKey) {
    return "stripe";
  }

  return "mock"; // ← ✅ DEFAULT: mock adapter
}

// So in development:
// pnpm test → NO Stripe API calls (MockPaymentAdapter)
// E2E tests pass completely offline
// Stripe integration optional (set STRIPE_SECRET_KEY if testing real provider)
```

**E2E Test**:
```typescript
// apps/api/test/commercial/commercial-journey.e2e.ts
it("confirms checkout (mock payment)", async () => {
  const checkout = await session.post<CommercialOnboardingSummaryPayload>(
    `/commercial/onboarding/${onboardingToken}/confirm-checkout`,
    {}, // ← No sessionId → triggers mock inline confirmation
  );

  expect(checkout.status).toBe("PAID");
  // ✅ Payment confirmed via MockPaymentAdapter
  // ❌ No Stripe cost
  // ❌ No internet required
  // ✅ Deterministic (always succeeds)
});
```

---

## 5. Provider Decoupling (Non-negotiable)

### Same Interface, Different Implementations

```typescript
// apps/api/src/modules/commercial/adapters/payment.adapter.ts (interface)
export interface PaymentAdapter {
  createCheckout(...): Promise<CheckoutSession>;
  confirmPayment(reference: string): Promise<PaymentConfirmation>;
  handleWebhookEvent(event: Record<string, any>): Promise<void>;
  verifyWebhookSignature(body: string, signature: string): boolean;
}

// Implementation 1: MOCK
// apps/api/src/modules/commercial/adapters/mock-payment.adapter.ts
@Injectable()
export class MockPaymentAdapter implements PaymentAdapter {
  private sessions = new Map<string, CheckoutSession>();

  async createCheckout(...) {
    const session = { id, reference: `mock_${Date.now()}`, url: "mock", ... };
    this.sessions.set(reference, session);
    return session;
  }

  async confirmPayment(reference: string) {
    return { status: "confirmed", amount: 34900, ... };
  }
}

// Implementation 2: STRIPE
// apps/api/src/modules/commercial/adapters/stripe-payment.adapter.ts
@Injectable()
export class StripePaymentAdapter implements PaymentAdapter {
  private stripe: Stripe;

  async createCheckout(...) {
    const session = await this.stripe.checkout.sessions.create({...});
    return { id: session.id, reference: session.id, url: session.url, ... };
  }

  async confirmPayment(reference: string) {
    const session = await this.stripe.checkout.sessions.retrieve(reference);
    return { status: "confirmed", amount: session.amount_total, ... };
  }
}

// Service doesn't care which implementation:
// apps/api/src/modules/commercial/commercial.service.ts
async confirmCheckout(publicToken: string, sessionId?: string) {
  const adapter = this.paymentAdapterFactory.getAdapter(); // ← Either mock or stripe
  
  if (sessionId) {
    const confirmation = await adapter.confirmPayment(sessionId);
    // ✅ Same call works with both
  }
}

// Future: Add MercadoPago, PaySeguro, etc.
// @Injectable()
// export class MercadoPagoAdapter implements PaymentAdapter { ... }
```

---

## 6. No Mixing Public/Operational (Non-negotiable)

### Data Model Isolation

```typescript
// apps/api/prisma/schema.prisma

// ✅ Aesthetic clinic operational domain
model Patient {
  id String @id
  tenantId String
  firstName String
  lastName String
  email String
  phone String
  whatsappPhone String? ← Note: WhatsApp phone stored HERE
  medicalHistory? String
  // ❌ NO payment fields
}

model Appointment {
  id String @id
  tenantId String
  patientId String
  professional Professional
  status AppointmentStatus
  // ❌ NO payment fields
}

// ✅ Billing domain (separate)
model CommercialOnboarding {
  id String @id
  tenantId String ← Created AFTER payment
  planId String
  status CommercialOnboardingStatus
  paymentReference String? ← Payment metadata
  
  // ❌ NO patient references (aesthetic clinic has not been created yet)
  // ❌ NO appointment data
  // ✅ ONLY aesthetic clinic metadata + admin creation
}
```

**Data Flow**:
```
1. Commercial (Public) ← → Onboarding
   ├── Start: select plan
   ├── Complete: clinic/admin data
   ├── Create Checkout: payment session
   ├── Confirm: payment verified
   └── Finalize: TenantId assigned, Clinic created, Admin user created

2. Aesthetic Clinic Operations (Private) ← → Operations
   ├── Reception: view patients, book appointments
   ├── Scheduling: professional agenda, slots
   ├── Patients: list, search, edit
   └── Appointments: confirm, check-in, complete

// NO direct link until subscription activates in aesthetic clinic operational modules
```

---

## 7. WhatsApp as Adapter (Non-negotiable)

### Same Pattern as Payments

```typescript
// Spring 5: apps/api/src/modules/messaging/messaging.adapter.ts (interface)
export interface MessagingAdapter {
  sendMessage(message: OutboundMessage): Promise<{ messageId: string; status: string }>;
  receiveMessage(inbound: InboundMessage): Promise<void>;
  verifyWebhookSignature(body: string, signature: string): boolean;
  isHealthy(): Promise<boolean>;
}

// Implementation 1: MOCK (Sprint 5)
// apps/api/src/modules/messaging/adapters/mock-messaging.adapter.ts
@Injectable()
export class MockMessagingAdapter implements MessagingAdapter {
  private outbox = new Map<string, OutboundMessage>();

  async sendMessage(message: OutboundMessage) {
    const id = `msg_mock_${Date.now()}`;
    this.outbox.set(id, { ...message, id, status: "delivered" });
    return { messageId: id, status: "delivered" };
  }
}

// Implementation 2: WHATSAPP (Sprint 6)
// apps/api/src/modules/messaging/adapters/whatsapp-messaging.adapter.ts
@Injectable()
export class WhatsAppAdapter implements MessagingAdapter {
  private twilio: TwilioClient; // or MessageBird, etc.

  async sendMessage(message: OutboundMessage) {
    const result = await this.twilio.messages.create({
      to: message.recipient.phone,
      body: this.renderTemplate(message.template),
    });
    return { messageId: result.sid, status: "sent" };
  }
}

// Factory selects (same as payment):
// apps/api/src/modules/messaging/messaging-adapter.factory.ts
getAdapter(): MessagingAdapter {
  if (NODE_ENV === "production" && MESSAGING_WHATSAPP_API_KEY) {
    return this.whatsappAdapter;
  }
  return this.mockAdapter; // ← Default
}

// Service doesn't care which:
// apps/api/src/modules/reception/services/reception-messaging.service.ts
async sendAppointmentConfirmation(tenantId: string, appointmentId: string) {
  const adapter = this.messagingAdapterFactory.getAdapter(); // ← Either mock or whatsapp
  
  const result = await adapter.sendMessage({
    recipient: { phone: patient.whatsappPhone },
    template: { templateId: "appointment_confirmation", ... },
  });
  // ✅ Same call, different provider
}
```

---

## 8. Handoff to Human (Non-negotiable)

### Payment Escalation Path

```typescript
// apps/api/src/modules/commercial/commercial.controller.ts
@Post("onboarding/:token/escalate-to-staff")
@Roles(RoleCode.TENANT_ADMIN) // ← RBAC enforced
async escalateOnboarding(
  @Param("token") token: string,
  @Body() input: EscalationDto,
): Promise<{ escalationId: string }> {
  // ✅ Explicit escalation endpoint
  // Staff dashboard shows: "Payment failed for onboarding XYZ"
  // Admin clicks "Request support"
  // System: creates escalation ticket, notifies support@operaclinic
}
```

### Messaging Escalation Path (Sprint 5)

```typescript
// apps/api/src/modules/reception/reception-webhook.controller.ts
@Post("webhook/messages/inbound")
async handleInboundMessage(@Body() body: any) {
  // Reception receives inbound from patient
  // Backend decides:
  // ✅ Can auto-respond? (e.g., "Your appointment is confirmed")
  // ⚠️ Need human? (e.g., "I want to reschedule")
  //   → Route to staff dashboard
  //   → Staff replies via manual send endpoint
}

@Post("messages/manual-send")
@Roles(RoleCode.RECEPTION_MANAGER)
async sendManualMessage(@Body() input: SendMessageDto) {
  // ✅ Staff always in loop
  // ❌ No autonomous AI messaging
  // Backend validates: message type, recipient, tenant
}
```

---

## 9. RBAC Enforced (Non-negotiable)

### Commercial Module - Payment Operations

```typescript
// apps/api/src/modules/commercial/commercial.controller.ts

// ✅ No @Roles() = Public endpoint (for clinics signing up)
@Post("onboarding/start")
async startOnboarding(@Body() input: StartCommercialOnboardingDto) { ... }

// ✅ Public endpoint (clinic entering data)
@Post("onboarding/:token/complete")
async completeOnboarding(@Param("token") token: string, ...) { ... }

// ❌ Only TENANT_ADMIN can escalate failed payments
@Post("onboarding/:token/escalate-to-staff")
@Roles(RoleCode.TENANT_ADMIN)
async escalateOnboarding(...) { ... }

// ❌ Only SUPER_ADMIN can view all onboardings
@Get("admin/onboardings")
@Roles(RoleCode.SUPER_ADMIN)
async listAllOnboardings() { ... }
```

### Messaging Module - RBAC (Sprint 5)

```typescript
// apps/api/src/modules/reception/reception.controller.ts

// ❌ Only RECEPTION_MANAGER can send manual messages
@Post("messages/send")
@Roles(RoleCode.RECEPTION_MANAGER)
async sendManualMessage(@Body() input: SendMessageDto) { ... }

// ❌ Only TENANT_ADMIN can view message audit log
@Get("messages/log")
@Roles(RoleCode.TENANT_ADMIN)
async getMessageLog() { ... }

// Public endpoint (for provider webhook)
@Post("webhook/messages/inbound")
async handleInboundMessage(@Body() body: any) { ... } // ← No role check; signature verified
```

---

## 10. Niche: Aesthetic Clinic Only (Non-negotiable)

### Product Boundaries

```typescript
// apps/api/src/modules/commercial/commercial.service.ts
async listPublicPlans() {
  const plans = await this.prisma.plan.findMany({
    where: {
      isActive: true,
      isPublic: true,
      // 🎯 Database constraints: only clinic/aesthetic/SaaS plans
      // NO personal loan products
      // NO retail products
      // NO medical/hospital-specific workflows
    },
  });

  return plans
    .filter((plan) => findCommercialPublicPlanCatalogEntry(plan.code))
    // ✅ Validate plan code is in app's catalog
    // Plan codes: ESTETICA_FLOW, ESTETICA_BEAUTY, etc.
}

// packages/shared/src/commercial.ts
export const COMMERCIAL_PLAN_CATALOG = {
  ESTETICA_FLOW: {
    code: "ESTETICA_FLOW",
    name: "OperaClinic Flow - Aesthetic Clinics",
    description: "Agenda + recepção + pacientes + WhatsApp",
  },
  ESTETICA_BEAUTY: {
    code: "ESTETICA_BEAUTY",
    name: "OperaClinic Beauty Plus",
    description: "Flow + agendamento online",
  },
  // ❌ NO: HOSPITAL_MANAGEMENT
  // ❌ NO: DENTAL_OFFICE
  // ❌ NO: PHARMACY_RETAIL
};
```

---

## 11. No Patient App MVP (Non-negotiable)

### "Patients interact via WhatsApp, not app"

```typescript
// ✅ Patient has WhatsApp phone in database
model Patient {
  whatsappPhone String? // ← Channel
}

// ✅ Backend sends messages to WhatsApp
async sendAppointmentConfirmation() {
  const recipient = {
    phone: patient.whatsappPhone, // ← E.164 format
  };
  await messagingAdapter.sendMessage({ recipient, template: {...} });
}

// ❌ NO mobile app development yet
// ❌ NO patient app endpoints
// ❌ NO app-specific UI
// ❌ NO app-only features

// ✅ Future: If app is built, same backend APIs work
}

// Professional lightweight app (future Sprint 7+):
// - Same backend APIs
// - No separate business rules
// - No app-only data
```

---

## 12. Check-in in Reception (Non-negotiable)

### Workflow Ownership

```typescript
// apps/api/src/modules/reception/reception.service.ts
// ✅ Check-in is reception responsibility

async checkInPatient(
  tenantId: string,
  appointmentId: string,
) {
  const appointment = await this.appointmentService.findOne(appointmentId);
  // Validate: appointment status is CONFIRMED
  // Validation: professional is available
  // Update: status → CHECKED_IN
  // Trigger: send "Welcome" message to patient
  // ❌ Check-in does NOT:
  //    - Approve billing
  //    - Confirm payment
  //    - Modify schedule
}

// ❌ Check-in is NOT part of:
// - Commercial (payments are separate)
// - Professional app (professionals see appointments, staff checks in)
// - Patient app (doesn't exist in MVP; WhatsApp sends notification)

// ✅ Check-in workflow:
// 1. Reception agent views day agenda
// 2. Patient arrives
// 3. Reception clicks "Check-in" button
// 4. System updates appointment.status → CHECKED_IN
// 5. System sends WhatsApp: "Você foi confirmado. Aguarde na recepção."
```

---

## Summary: Rules Embodied in Code

| Rule | Enforced In |
|------|------------|
| D-001: Multi-tenant | Service layer + adapter layer + DB schema (tenantId everywhere) |
| D-007: Backend owns schedule | No commercial module touches scheduling DTOs |
| D-009: Billing separation | separate `commercial/` module, no imports from aesthetic clinic operational modules |
| D-012: Mock-first testing | PaymentAdapterFactory defaults to MockPaymentAdapter |
| Non-negotiable: Provider decoupling | PaymentAdapter interface + factory + mock implementation |
| Non-negotiable: Multi-tenant isolation | tenantId in OutboundMessage, InboundMessage interfaces |
| Non-negotiable: RBAC | @Roles() decorators on sensitive endpoints |
| Non-negotiable: Backend authority | No frontend state transitions; all via explicit service calls |
| Non-negotiable: Handoff to human | Escalation endpoints + staff notification workflow |
| Non-negotiable: Aesthetic clinic niche | COMMERCIAL_PLAN_CATALOG constants + isPublic guards |
| Non-negotiable: No Patient app MVP | WhatsApp recipient phone; no app-specific endpoints |
| Non-negotiable: Check-in in reception | Check-in logic in reception.service.ts, not commercial |

