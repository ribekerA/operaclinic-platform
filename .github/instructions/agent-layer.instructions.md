---
name: Agent Layer - Guardrails & Fallback Authority
description: "Regras obrigatórias para agents e skills: execução assistida, nunca decidir fora do guardrail, fallback humano obrigatório, output auditável."
paths: ["apps/api/src/modules/agent/**", "prompts/codex/**", "prompts/copilot/**"]
---

# Agent Layer Instructions — Guardrails & Fallback Authority

**Escopo**: [apps/api/src/modules/agent](apps/api/src/modules/agent) + prompts [codex](prompts/codex) / [copilot](prompts/copilot)  
**Autoridade Absoluta**: Backend regras, frontend UI, receptionist decisão. Agent = executor, nunca owner.  
**Crítica**: Agent sai do guardrail = violação de autoridade, exposure, cliente prejudicado

---

## 1. Princípios Não-Negociáveis

### 1.1 Agent é Helper, Nunca Decision Owner

| Área | Backend Authority | Agent Permitido | Agent Bloqueado |
|------|------|--------|---------|
| Scheduling | Disponibilidade, conflito, hold, lifecycle | Formatar slots, sugerir próx. disponível | Confirmar slot, criar hold, mudar status |
| Paciente | Dados pessoais, histórico, preferências | Exibir dados contexto, sugerir padrão | Criar paciente, deletar, mudar contato |
| Pagamento | Preço, desconto, validade | Exibir preço, sugerir plano | Criar desconto, mudar preço, prometer free |
| WhatsApp | Integridade thread, dedup, handoff | Triagem, formatação, sugestão resposta | Confirmar delivery, garantir entrega, ocultar erro |
| Recepção | Fluxo checkin, status transition | Sugerir ação, pré-preencher, notify humano | Fazer checkin, mudar status, violar lifecycle |

**Regra**: Se Agent dúvida de autoridade, handoff para humano.

### 1.2 Guardrails = Limites Explícitos

Cada skill/agent tem guardrails definidos:

```typescript
interface AgentGuardrail {
  name: "scheduling_booking" | "messaging_triagem" | "reception_confirm" | ...;
  authority: "backend" | "reception" | "patient" | "system";
  inputs: {
    required: ["patientId", "slotsAvailable", "..."];
    forbidden: ["appointmentId", "..."];
  };
  outputs: {
    allowed: ["next_action", "suggestion", "context", "confidence"];
    forbidden: ["status_change", "guarantee", "price_override"];
  };
  fallback: {
    on_error: "handoff_immediate";
    on_low_confidence: "threshold_70_percent";
    on_blocked_decision: "escalate_humano";
  };
}
```

### 1.3 Fallback Obrigatório

**Cenários de fallback automático**:

| Sinal | SLA | Ação |
|-------|-----|------|
| Confiança < 70% | 30s | Handoff + mostrar opções |
| Erro de backend (5xx, timeout) | 10s | Retornar erro ao humano + log |
| Decisão fora de guardrail | Imediato | Block + handoff + audit |
| Ambiguidade > 1 match | 10s | Solicitar clarificação ou escalação |
| Sensível (reclamação, feedback) | 30s | Agent NÃO responde; handoff |
| Fora de escopo agent | 10s | Dizer "Não consigo ajudar nisso"; escalação |

---

## 2. Scheduling Agent (Booking Assistido)

### 2.1 Inputs Permitidos

```typescript
interface SchedulingAgentInput {
  tenantId: string; // ✅ REQUIRED
  patientId?: string; // can be null (unknown)
  patientPhone?: string; // to find patient
  preferredDate?: DateTime; // hint, not lock
  preferredTime?: string; // "morning" | "afternoon" | exact time
  preferredProfessional?: string; // name or ID
  maxWaitDays?: number; // constraint (ex: 7)
  reason?: string; // context ("rescheduled from X", "new patient")
}
```

### 2.2 Processing

1. **Fetch availability** from `scheduling.service`:
   - Backend returns slots for pro, date, clinic.
   - Agent formats for human readability.

2. **Classify preference**:
   - "Tomorrow morning" → parse to time range.
   - "Next available" → filter to soonest.
   - "Maria the professional" → validate exists, return ID.

3. **Find or create hold**:
   - Call `scheduling.hold()` → returns holdId + expiresAt.
   - Hold is temp reservation, respects backend validation.

4. **Output**: Next action + options.

### 2.3 Outputs Allowed

```typescript
interface SchedulingAgentOutput {
  next_action: "select_slot" | "request_clarification" | "handoff_required";
  available_slots: [
    { 
      startTime, 
      professional, 
      holdId, 
      expiresAt,
      confidence: 0.95 
    },
    ...
  ];
  confidence: 0.95; // booking likely succeeds
  reason: "Found 3 slots matching morning + Maria";
  metadata: {
    tenantId,
    patientId,
    holdDurationMinutes: 15,
  };
}
```

### 2.4 Bloqueadores

- ❌ "I confirmed your slot" (never, wait for backend).
- ❌ "Slot is definitely available" (no, say "hold reserved for 15 min").
- ❌ Create hold outside `scheduling.hold()`.
- ❌ Overr ide backend conflict error; always report to humano.

---

## 3. Messaging Triage Agent

### 3.1 Input

```typescript
interface MessagingTriageInput {
  tenantId: string;
  messageId: string; // for dedup
  senderPhone: string;
  body: string;
  timestamp: DateTime;
  threadId?: string; // if existing thread
}
```

### 3.2 Processing

1. **Classify intent**:
   - Type: `booking`, `confirmation`, `cancellation`, `doubt`, `urgency`, `escalation`
   - Confidence: 0..1
   - Example: "Quero remarcar" → type = reschedule, confidence = 0.85

2. **Detect urgency**:
   - Keywords: "dor", "emergência", "sangrando", "urgent"
   - Escalation: yes/no

3. **Find patient context**:
   - By phone, by name in message
   - Appointments in future
   - Last visit, no-show pattern

4. **Output recommendation**.

### 3.3 Output

```typescript
interface MessagingTriageOutput {
  thread_id: string;
  intent: "booking" | "confirmation" | "cancellation" | "doubt" | "urgency" | "escalation";
  confidence: 0.85;
  urgency_detected: false;
  patient_context: {
    patientId?: string;
    name?: string;
    appointmentsInFuture: number;
    noShowRate: 0.1,
  };
  next_action: "reception_skill" | "confirmation_check" | "handoff_required";
  handoff_reason?: "Patient not found; multiple matches";
  message_analysis: {
    keywords_detected: ["remarcar"],
    tone: "neutral",
  };
  recommendations: [
    "Ask clarification: which appointment?",
    "Or show available slots",
  ];
  metadata: {
    tenantId,
    messageId,
    threadId,
    confidence,
  };
}
```

### 3.4 Bloqueadores

- ❌ "Your booking is confirmed" (only backend confirms).
- ❌ Ignore urgency signal.
- ❌ Assume patient ID without high confidence.
- ❌ Modify template or send custom message.

---

## 4. Reception Agent (Support Assistido)

### 4.1 Inputs

```typescript
interface ReceptionAgentInput {
  tenantId: string;
  actorId: string; // receptionist ID
  appointmentId: string;
  action: "confirm" | "reschedule" | "cancel" | "checkin" | "offer_alternatives";
  context?: Record<string, any>;
}
```

### 4.2 Processing

1. **Fetch appointment**: call backend scheduling.
2. **Validate action**: is appointment in correct status?
3. **Prepare options**: slots alternatives, template message, etc.
4. **Output: suggest next move**.

### 4.3 Output

```typescript
interface ReceptionAgentOutput {
  action_ready: true;
  can_proceed: boolean;
  reason_if_blocked: "Appointment already checked-in" | "Can't cancel within 24h" | null;
  options: [
    {
      label: "Confirm via WhatsApp",
      channel: "whatsapp",
      template: "appointment_confirmation",
      variables: { patientName, appointmentTime, profesionalName },
    },
    {
      label: "Offer reschedule",
      slots: [ ...available... ],
    },
  ];
  next_step: "execute_action" | "show_options" | "handoff_required";
  confidence: 0.95;
  metadata: { tenantId, appointmentId, actorId };
}
```

---

## 5. Output Contract (All Agents)

### 5.1 Mandatory Fields

```typescript
interface AgentOutput {
  // ✅ Identification
  agent_id: string;
  execution_id: string; // UUID for tracing
  timestamp: DateTime;
  duration_ms: number;

  // ✅ Action
  next_action: "proceed" | "select_option" | "clarify" | "handoff_required" | "error";
  confidence: number; // 0..1
  reason: string; // brief explanation

  // ✅ Data
  data: Record<string, any>; // result of processing
  options?: Array<{ label: string; value: any; confidence: number }>;

  // ✅ Guardrails
  guardrails_respected: boolean;
  violations?: [{ guardrail: string; reason: string }];

  // ✅ Fallback
  should_escalate: boolean;
  escalation_trigger?: string; // if yes

  // ✅ Audit
  metadata: {
    tenantId: string;
    actorId?: string; // if human-initiated
    inputs_hash: string; // hash of inputs for dedup
  };
}
```

### 5.2 Handoff Message

```typescript
interface AgentHandoffMessage {
  handoff_necessary: boolean;
  motivo: string; // explicit reason
  urgencia: "alta" | "media" | "baixa";
  contexto_sucinto: string; // what happened
  sla_recomendado: string; // "5min" | "10min" | "1h"
  actor_recomendado: string; // "reception" | "commercial" | "admin"
  fatos_confirmados: string[];
  hipoteses: string[];
  lacunas: string[]; // what's missing
  dados_para_handoff: {
    threadId?: string;
    appointmentId?: string;
    patientId?: string;
    paymentReference?: string;
  };
}
```

---

## 6. Testing Obrigatório

### 6.1 Unit Tests

- [ ] Guardrail: agent NÃO executa fora de escopo.
- [ ] Confidence < 70% → handoff com opções.
- [ ] Fallback on backend error (5xx) → handoff sem crash.
- [ ] Tenant isolation: agent CLI A não vê CLI B.
- [ ] Output contract: ALL required fields present + valid.
- [ ] Audit trail: `execution_id`, `tenantId`, `actor_id` sempre escrito.

### 6.2 Integration Tests

- [ ] E2E scheduling: agent suggests slot → receptionist approves → backend creates.
- [ ] E2E triage: message → intent classified → receptionist actiona.
- [ ] E2E handoff: confidence < 70% → handoff message criado + receptionist notificado.

### 6.3 Production Smoke

```bash
# Agent guardrails must pass
pnpm --filter @operaclinic/api test -- agent
# Smoke E2E includes agent flow (via messaging/reception)
```

---

## 7. Observabilidade

| Métrica | Lugar |
|---------|-------|
| `agent.execution_total` | Counter (agent_id, outcome) |
| `agent.confidence_histogram` | Histogram (agent_id) |
| `agent.handoff_rate` | Ratio handoffs / total |
| `agent.guardrail_violation` | Counter (alert if > 0) |
| `agent.fallback_triggered` | Counter (guardrail, reason) |
| `agent.execution_duration_ms` | Histogram (agent_id) |

---

## 8. Checklist Antes de Merge

- [ ] Guardrails explícitos: inputs, outputs, forbidden actions.
- [ ] Confidence threshold definido (ex.: 70%).
- [ ] Fallback automático em: erro backend, ambiguidade, fora de escopo.
- [ ] Output contract implementado: ALL required fields.
- [ ] Handoff message com motivo, urgência, lacunas.
- [ ] Tenant isolation validada.
- [ ] Audit trail: `execution_id`, `tenantId`, `actor_id`, `timestamp`.
- [ ] Testes cobrem happy path + fallback scenarios.
- [ ] Agent NUNCA sobrescreve autoridade backend.
- [ ] Documentação de guardrails inclusa.

---

## 9. Referências Rápidas

| Arquivo | Função |
|---------|--------|
| [agent.module.ts](apps/api/src/modules/agent/agent.module.ts) | Agent orchestration |
| [agent-orchestrator.service.ts](apps/api/src/modules/agent/agent-orchestrator.service.ts) | Routing + execution |
| [agent-message-bridge.service.ts](apps/api/src/modules/agent/agent-message-bridge.service.ts) | Messaging integration |
| [prompts/codex/](prompts/codex/) | Agent prompt templates |
| [prompts/copilot/](prompts/copilot/) | Copilot skill prompts |

---

**Versão**: 1.0  
**Última atualização**: 2026-04-04  
**Mantido por**: Tech team OperaClinic
