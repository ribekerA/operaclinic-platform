---
name: Messaging - WhatsApp Deduplication & Thread Integrity
description: "Regras obrigatórias para mensageria: deduplicação, thread integrity, handoff, webhook signature, segurança realtime e auditoria."
paths: ["apps/api/src/modules/messaging/**", "apps/api/src/modules/agent/*bridge*", "prompts/codex/*whatsapp*", "prompts/copilot/*messaging*"]
---

# Messaging Instructions — WhatsApp Deduplication & Thread Integrity

**Escopo**: [apps/api/src/modules/messaging](apps/api/src/modules/messaging) + agent integration  
**Crítica**: Mensageria é canal de recepção assistida e confirmação; perda = paciente abandonado  
**Objetivo**: Zero perda de mensagem, deduplicação garantida, handoff claro quando necessário

---

## 1. Princípios Não-Negociáveis

### 1.1 Deduplicação Obrigatória

**Todo inbound é processado NO MÁXIMO uma vez**:
- Webhook WhatsApp entrega: `{ messageId, timestamp, body, senderId, ... }`
- Backend armazena `messageId` em dedupe table (ex.: `MessageWebhookDedupeLog`).
- Se `messageId` já existe, retorna `ACK 200` sem reprocessar.
- Nenhuma query, nenhuma mutação duplicada.

**Referência**: [apps/api/src/modules/messaging/whatsapp-webhooks.service.ts](apps/api/src/modules/messaging/whatsapp-webhooks.service.ts)

### 1.2 Thread Integrity

**Thread = sequência de mensagens inbound + outbound da MESMA pessoa, MESMA clínica**:
- Backend agrupa por `{ tenantId, senderId (phone/contact), messageThreadId }`.
- Cada thread tem `createdAt`, `updatedAt`, `status`, `context` (paciente encontrado? escalonado?).
- Thread NUNCA se mescla; NUNCA se apaga.
- Se thread perdida, paciente fica orfão → handoff obrigatório.

### 1.3 Webhook Signature Validation

**Toda mensagem vem com assinatura criptográfica**:
- WhatsApp envia: `X-Hub-Signature: sha256=...`.
- Backend valida com webhook secret (`WHATSAPP_WEBHOOK_SECRET`).
- Se inválido: retorna `401 Unauthorized`, não processa.
- Sem validação = risco de falsificação de identidade (paciente fake).

**Referência**: [apps/api/src/modules/messaging/whatsapp-webhooks.controller.ts](apps/api/src/modules/messaging/whatsapp-webhooks.controller.ts)

### 1.4 Segurança Realtime

- **Token expire**: 1 hora para message processing; após, requerir re-auth.
- **Rate limit per thread**: máx 10 mensagens por minuto (previne spam).
- **Rate limit per phone**: máx 100 mensagens por hora global (DDoS).
- **Abuse detection**: padrão de bot detectado → bloqueio + escalação.

---

## 2. Fluxo Inbound (Receber)

### 2.1 Webhook Reception

**Entrada**: POST `/messaging/whatsapp/webhooks`

```
1. Validar assinatura
   IF invalid signature → reject 401, log abuse

2. Extract messageId + tenantId (from forwarded tenant)
   VALIDATE tenantId matches clinic config

3. Dedupe check
   IF messageId exists → ACK 200, return existing
   ELSE → mark processingat now

4. Extract context
   - sender (phone)
   - body (message text)
   - timestamp (WhatsApp time)
   - mediaType (if any)

5. Find or create thread
   LOOKUP thread by (tenantId, senderPhone)
   IF not found → create new thread, status = PENDING_CONTEXT

6. Enrich context
   - Find patient by phone in clinic
   - Find appointments in future
   - Detect keywords (urgency, reschedule, cancel)

7. Classify intent
   - type: booking | confirmation | cancellation | doubt | urgency | escalation
   - confidence: 0..1
   - reason: _why this classification_

8. Record in thread
   - messageId, body, type, confidence, timestamp
   - thread.updatedAt = now

9. Route to next step
   - confidence < 0.7 OR type = urgency → handoff_required
   - type = booking → call reception skill
   - type = confirmation → call scheduling check
   - etc.
```

### 2.2 Deduplication Table

```typescript
// Message deduplication table
interface MessageWebhookDedupeLog {
  id: string;
  tenantId: string;
  whatsappMessageId: string; // ✅ PRIMARY KEY
  receivedAt: DateTime;
  processingStatus: "pending" | "success" | "failed";
  processedResult?: {
    threadId: string;
    intentType: string;
    confidence: number;
  };
  createdAt: DateTime;
}

// Cleanup: DELETE where receivedAt < now - 7 days
```

### 2.3 Thread Context Table

```typescript
interface MessageThread {
  id: string;
  tenantId: string; // ✅ TENANT ISOLATION
  senderPhone: string;
  patientId?: string; // nullable until match found
  status: "pending_context" | "active" | "resolved" | "handoff_escalated";
  lastIntentType?: string;
  lastIntentConfidence?: number;
  createdAt: DateTime;
  updatedAt: DateTime;
  expiresAt: DateTime; // 7 days from last message
  audit: [
    { timestamp, action, actor, details }
  ];
}
```

---

## 3. Fluxo Outbound (Enviar)

### 3.1 Message Queue

**Toda resposta passa por fila**:
- Status: `pending` → `sent` / `failed`
- Retry: backoff exponencial (1s, 2s, 4s, máx 5).
- Timeout: 30s por tentativa.
- Falha permanente: log + alert + handoff para recepção humana.

**Referência**: [apps/api/src/modules/messaging/adapters/](apps/api/src/modules/messaging/adapters/)

### 3.2 Confirmation Templates

**Backend NUNCA envia mensagem não-templated**:
- Template pré-aprovado em `MessageTemplate` entity.
- Variables: `{{ patientName }}`, `{{ appointmentTime }}`, `{{ clinicPhone }}`.
- Cada template tem `name`, `body`, `tenantId`, `language`, `status` (active/draft).

**Bloqueador**: Agent não monta mensagem custom; só substitui variáveis em template.

### 3.3 Delivery Tracking

```typescript
interface OutboundMessage {
  id: string;
  tenantId: string;
  threadId: string;
  recipientPhone: string;
  templateId: string;
  variables: Record<string, any>;
  status: "pending" | "sent" | "delivered" | "failed" | "read";
  whatsappMessageId?: string; // after success
  sentAt?: DateTime;
  deliveredAt?: DateTime;
  readAt?: DateTime;
  failureReason?: string;
  retryCount: number;
  createdAt: DateTime;
  audit: [
    { timestamp, action, actor }
  ];
}
```

---

## 4. Thread Handoff

### 4.1 Trigger Automático

| Sinal | Ação | SLA |
|-------|------|-----|
| Message timeout (5s sem resposta) | Escalate to reception | 1min ACK |
| Confidence < 70% | Handoff + mostrar opções | 30s |
| Urgency keywords detectadas | Handoff prioritário | 5min |
| Patient não encontrado (3 attempts) | Handoff + manual match | 10min |
| Message fora de horário (21h-8h??) | Fila automática + handoff próx. dia | - |
| Payment/refund mention | Escalação financeira | 5min |

### 4.2 Handoff Message

```json
{
  "handoff_necessario": true,
  "motivo": "Paciente solicitou remarcar; múltiplas tentativas de match falharam",
  "urgencia": "media",
  "thread_id": "thread-uuid",
  "sender_phone": "+5511987654321",
  "patient_id": null,
  "ultimas_3_mensagens": [
    { "timestamp": "ISO", "body": "...", "role": "patient" },
    { "timestamp": "ISO", "body": "...", "role": "clinic" }
  ],
  "contexto": {
    "intent_detectado": "reschedule",
    "confianca": 0.65,
    "opcoes_disponiveis": [...]
  },
  "sla_recomendado": "10min",
  "actor_recomendado": "reception_team"
}
```

### 4.3 Reassurance Message (para paciente)

Se handoff necessário, enviar imediatamente:

```
Olá! 👋 Sua mensagem chegou com segurança.
Um membro da nossa equipe responderá em breve (usuário: [nome]).
Obrigada pela paciência!
```

---

## 5. Segurança & Validação

### 5.1 Input Validation

- **Phone**: formato validado (brasileiros = +55 11-99999-9999 ou sem +55).
- **Body**: máx 4096 chars; caracteres de controle removidos.
- **Media**: tipos permitidos only (image, video, audio); scan para malware.

### 5.2 Abuse Protection

```typescript
// apps/api/src/modules/messaging/messaging-webhook-abuse-protection.service.ts
async assertWithinRateLimit(
  tenantId: string,
  senderPhone: string,
  threadId: string,
): Promise<void> {
  // Per-thread: máx 10/min
  const threadCount = await this.countLastNMinutes(threadId, 1);
  if (threadCount >= 10) throw new Error("Rate limit exceeded");

  // Per-phone-global: máx 100/hour
  const phoneCount = await this.countLastNHours(senderPhone, 1);
  if (phoneCount >= 100) throw new Error("Global rate limit exceeded");

  // Bot detection: padrão de timing suspeito
  if (this.isBotLike(threadId)) throw new Error("Suspected bot activity");
}
```

### 5.3 Tenant Isolation

- **Nenhuma thread pode ter mensagens de múltiplos tenants**.
- **Query SEMPRE filtra por `tenantId`**.
- **Webhook DEVE extrair `tenantId` de forwarded-header ou auth token**.
- **Falha de isolation = incident crítico → alert imediato**.

---

## 6. Testes Obrigatórios

### 6.1 Unit Tests

- [ ] Dedup: webhook duplicado → processado 1x, retorna mesmo resultado.
- [ ] Webhook signature invalid → retorna 401.
- [ ] Rate limit: 11ª mensagem em 1 min → erro.
- [ ] Tenant isolation: thread de clinic A não visible em clinic B.
- [ ] Intent classification: agendamento → confidence > 0.8.
- [ ] Template variable substitution: sem crash, output válido.
- [ ] Outbound retry: 1 falha → retry, 3 falhas consecutivas → alert.

### 6.2 Integration Tests

- [ ] E2E: webhook → dedup → thread → classify → handoff → recepção.
- [ ] Concurrency: 2 webhooks simultâneos, mesma phone → 1 processa, 1 dedup.
- [ ] Timeout: se backend não responder em 30s → WhatsApp retry.

### 6.3 Production Smoke

```bash
# Pre-deploy
pnpm --filter @operaclinic/api test -- messaging
# Smoke: enviar msg teste, verificar thread creation + dedup
```

---

## 7. Observabilidade Mínima

| Métrica | Lugar |
|---------|-------|
| `whatsapp.webhook.received_total` | Counter (tenantId, status) |
| `whatsapp.webhook.dedup_ratio` | Ratio de webhooks duplicate |
| `whatsapp.message.processing_duration_ms` | Histogram |
| `whatsapp.thread.handoff_rate` | Ratio (thread que handoff / total) |
| `whatsapp.outbound.delivery_success_rate` | Ratio sent vs failed |
| `whatsapp.outbound.retry_exhausted` | Counter (alert if > 0) |

---

## 8. Checklist Antes de Merge

- [ ] Webhook signature validado; sem validação = rejeitar.
- [ ] Deduplicação por `messageId` testada (retry = idempotente).
- [ ] Thread criada com `tenantId` + `senderPhone` + isolamento testado.
- [ ] Intent classification com confidence; < 70% → handoff.
- [ ] Handoff trigger e mensagem ao paciente testados.
- [ ] Rate limit por thread + global implementado.
- [ ] Outbound message fila com retry exponencial.
- [ ] Audit log registrado: `tenantId`, `threadId`, `messageId`, `action`, `timestamp`.
- [ ] Testes cobrem dedup, timeout, retry, tenant isolation.
- [ ] Documentação atualizada se regra mudou.

---

## 9. Referências Rápidas

| Arquivo | Função |
|---------|--------|
| [whatsapp-webhooks.service.ts](apps/api/src/modules/messaging/whatsapp-webhooks.service.ts) | Webhook processing + dedup |
| [message-threads.service.ts](apps/api/src/modules/messaging/message-threads.service.ts) | Thread CRUD + context |
| [messaging-webhook-abuse-protection.service.ts](apps/api/src/modules/messaging/messaging-webhook-abuse-protection.service.ts) | Rate limit + bot detect |
| [handoff-requests.service.ts](apps/api/src/modules/messaging/handoff-requests.service.ts) | Handoff workflow |
| [whatsapp-webhooks.controller.ts](apps/api/src/modules/messaging/whatsapp-webhooks.controller.ts) | HTTP endpoint |

---

**Versão**: 1.0  
**Última atualização**: 2026-04-04  
**Mantido por**: Tech team OperaClinic
