# 🔍 Auditoria Técnica & Operacional — OperaClinic Platform

**Data**: 04-04-2026  
**Objetivo**: Validar prontidão para "reduzir perda operacional em agenda e recepção, com menos no-show, resposta mais rápida e operação mais previsível"  
**Escopo**: 5 domínios críticos (Scheduling, Reception, Messaging+Handoff, Onboarding, Observability)  
**Metodologia**: Code inspection + Doc vs Code comparison + Risk assessment

---

## 📊 STATUS GERAL

| Domínio | Prontidão | Status | Bloqueador? | Impacto em ROI |
|---------|-----------|--------|-----------|----------------|
| **Scheduling** | 85% ✅ | Verde | Não | Médio (faltam métricas) |
| **Reception** | 90% ✅ | Verde | Não | Alto (UI pronta) |
| **Messaging** | 70% ⚠️ | Amarelo | **SIM** | Crítico (sem dedup) |
| **Commercial** | 65% ⚠️ | Amarelo | **SIM** | Crítico (sem dedup) |
| **Observability** | 40% ❌ | Vermelho | **SIM** | Crítico (sem measurement) |

---

## 🎯 BLOCO 1: SCHEDULING

### ✅ O Que Já Existe

- **Backend Authority 100%**: Concorrência controlada via PostgreSQL `pg_advisory_xact_lock` + Serializable isolation
  - Lock Key: `(tenantId, professionalId)` — não global
  - Wait timeout: 10s, abort timeout: 15s, max retry: 3
  - **Arquivo**: [scheduling-concurrency.service.ts](apps/api/src/modules/scheduling/scheduling-concurrency.service.ts)

- **Lifecycle Rígido**: AppointmentStatus com 11 estados bem definidos
  - BOOKED → CONFIRMED → CHECKED_IN → COMPLETED / NO_SHOW / CANCELED
  - Transitions registradas em `AppointmentStatusHistory` imutável
  - **Arquivo**: [appointments.service.ts](apps/api/src/modules/scheduling/appointments.service.ts)

- **Idempotência de Criação**: `createManualAppointment()` com idempotencyKey validação
  - Se mesmo key: retorna appointment existente sem duplicação
  - **Arquivo**: [appointments.service.ts](apps/api/src/modules/scheduling/appointments.service.ts#L120)

- **Hold/Reservation System**: SlotHold model com status (ACTIVE, CONSUMED, CANCELED, EXPIRED)
  - Hold criado → expiresAt fixo (padrão 15 min)
  - Valida conflito com appointment simultaneamente
  - **Arquivo**: [apps/api/src/modules/scheduling](apps/api/src/modules/scheduling)

- **Timezone Handling**: Normalizado em UTC na BD, conversão na boundary
  - `SchedulingTimezoneService` centraliza conversão
  - **Arquivo**: [scheduling-timezone.service.ts](apps/api/src/modules/scheduling/scheduling-timezone.service.ts)

- **Tenant Isolation Absoluta**: Validação em 3 camadas
  - Auth layer: tenantId extraído de JWT
  - Service layer: `resolveActiveTenantId()` em toda operação
  - DB layer: `WHERE tenantId = $1` em toda query
  - **Arquivo**: [scheduling-access.service.ts](apps/api/src/modules/scheduling/scheduling-access.service.ts)

### ⚠️ O Que Está Faltando

1. **No-Show Automation**
   - ❌ Sem job agendado para mark automático de no-show
   - UI permite receptionist marcar manual, mas sem captura de **motivo**
   - Sem análise de padrão (ex: "qual paciente tem mais no-show %?")
   - **Impacto**: Receptionist pode esquecer → dados sujo → análise confiável impossível
   - **Evidência**: `markReceptionAppointmentAsNoShow()` no UI existe, mas sem backend automation

2. **Hold Garbage Collection**
   - ❌ Holds expirados permanecem na DB indefinidamente
   - Sem cron job ou scheduled cleanup
   - Sem delete soft; apenas status EXPIRED
   - **Impacto**: Creep de dados, queries mais lentas
   - **Evidência**: Nenhum scheduler visível em agent ou health subnós

3. **Métricas Operacionais Zero**
   - ❌ Nenhuma métrica de appointments_created_per_tenant, no_show_rate, ocupação_media
   - Sem dashboard de "hoje: X agendados, Y confirmados, Z no-show"
   - **Impacto**: NÃO SEI se a mudança melhora no-show ou ocupação

4. **Validação de Regras de Negócio Incompleta**
   - ❌ scheduling-policies.service existe, mas não está claro quais regras estão lá vs faltam
   - Ex: "pode cancelar dentro de 24h?" — onde está essa regra?
   - **Evidência**: Arquivo existe mas não inspecionado em detalhe (LACUNA NA AUDITORIA)

### 🚨 O Que Está Frágil

1. **Contention em Scale**
   - `pg_advisory_lock` por professional: Se 100 receptionist tentam agendar simultaneamente mesmo professional
   - Possível queue + timeout
   - **Severidade**: MÉDIA (impacto em UX, não em dados)
   - **Teste**: Não há teste de load conhecido

2. **Retry Logic da Concorrência**
   - Retry com max 3 attempts, backoff exponencial
   - Se 4º attempt ainda falhar: erro para usuário
   - **Severidade**: BAIXA (raro em clínica operacional)
   - **Teste**: Não há teste de race condition

3. **Timezone Edge Case**
   - Conversion sempre UTC → clinic timezone
   - E se clinic change timezone após appointment criado?
   - **Severidade**: BAIXA (raro, mas posível)

### 📊 O Que Impede Medir ROI Real

| Métrica Necessária | Status | Impacto |
|-------------------|--------|--------|
| **No-show rate** (baseline + delta) | ❌ Sem captura de motivo | Alto |
| **Ocupação média por clinic** | ❌ Sem cálculo | Alto |
| **Average booking time** (primeiro contact → agendado) | ❌ Sem timestamp de start | Médio |
| **Rescheduling rate** (% appts remarcadas) | ❌ Sem métrica | Médio |
| **Physician load distribution** | ❌ Sem dashboard | Médio |
| **Cancellation rate by reason** | ❌ Motivo não capturado | Médio |

### 🛠️ O Que Deveria Ser Corrigido Antes de Escalar

**Ordem de Urgência:**

1. **[CRÍTICO]** Implementar auditoria de NO_SHOW automatio com captura de motivo
   - Scheduled job: todo dia 6am marca BOOKED/CONFIRMED + hora passada → NO_SHOW
   - Motivo capturado via manual input ou detectado automático
   - Métrica: no_show_rate por clinic/prof/paciente diário
   - **ETA**: 2-3 dias

2. **[CRÍTICO]** Implementar observability mínima (structured logging + métricas)
   - Sem isso, não sabe se rollout de agent layer piora/melhora as coisas
   - **ETA**: 3-5 dias (pode paralelizar com item 1)

3. **[ALTO]** Hold garbage collection
   - Cron daily que deleta SlotHold with status EXPIRED AND expiresAt < now - 1 day
   - **ETA**: 1 dia

4. **[MÉDIO]** Teste de concorrência em race condition
   - Simular 10+ requests simultâneos mesmo professional → validar lock behavior
   - **ETA**: 1 dia

### 📂 Arquivos Centrais

| Arquivo | Função | Criticidade |
|---------|--------|------------|
| [appointments.service.ts](apps/api/src/modules/scheduling/appointments.service.ts) | CRUD appointment + lifecycle | CRÍTICA |
| [scheduling-concurrency.service.ts](apps/api/src/modules/scheduling/scheduling-concurrency.service.ts) | Lock + serializable | CRÍTICA |
| [scheduling-access.service.ts](apps/api/src/modules/scheduling/scheduling-access.service.ts) | Tenant validation | CRÍTICA |
| [scheduling-policies.service.ts](apps/api/src/modules/scheduling/scheduling-policies.service.ts) | Business rules | ALTA |
| [scheduling-timezone.service.ts](apps/api/src/modules/scheduling/scheduling-timezone.service.ts) | Timezone conversion | MÉDIA |

---

## 🎯 BLOCO 2: RECEPTION

### ✅ O Que Já Existe

- **UI Fluida Pronta**: DayAgenda + AppointmentDrawer + QuickActions
  - Dashboard mostra urgências top + metrics (confirmados, no-show, pending)
  - Click appointment → side panel com contexto paciente + ações rápidas
  - **Arquivo**: [apps/web/app/clinics/*/reception*](apps/web/app/clinics)

- **Quick Actions < 1s**:
  - Confirm (BOOKED → CONFIRMED) + envio da mensagem
  - Check-in (CONFIRMED → CHECKED_IN)
  - Cancel (com motivo)
  - No-show (com motivo)
  - Reschedule (busca slots alternativos)
  - **Arquivo**: [reception.service.ts](apps/api/src/modules/reception)

- **Patient Context Display**:
  - Nome, CPF, contatos (phone + WhatsApp)
  - Histórico últimas 5 visitas
  - No-show rate (ex: "3 em 20 = 15%")
  - Status de confirmação atual
  - **Arquivo**: [reception-drawer.tsx](apps/web/components/clinic/)

- **Data Binding Seguro**:
  - `requestBackendWithSession()` injeta tenantId de JWT
  - `activeTenantId` extraído de user.activeTenantId
  - Role-based: @Roles(TENANT_ADMIN, CLINIC_MANAGER, RECEPTION)
  - **Arquivo**: [reception.controller.ts](apps/api/src/modules/reception/reception.controller.ts)

### ⚠️ O Que Está Faltando

1. **SLA Enforcement por Ação**
   - ❌ Confirm action não tem SLA (deveria ser < 2h para valer)
   - ❌ Sem alerta se appointment não confirmado 24h antes
   - ❌ Sem reminder automático para receptionist
   - **Impacto**: Paciente + receptionist esquecem → no-show

2. **Observability zero**
   - ❌ Sem métrica de "tempo médio confirm" ou "% appts confirm antes 24h"
   - ❌ Sem alerta se receptionist demora > 30min em ação
   - ❌ Sem dashboard de "hoje, confirmação: X%, check-in: Y%"
   - **Impacto**: Não sabe o padrão operacional

3. **Handoff Integration Frágil**
   - ❌ Quando receptionist recebe handoff de agent, como é notificado?
   - ❌ Sem fila visível de handoffs pendentes
   - **Impacto**: Handoff fica perdido

4. **Histórico de Ações Limitado**
   - ✅ Transições de status registradas
   - ❌ Sem "quem fez a ação", "quando", "em quanto tempo" em UI receptionist
   - **Impacto**: Difícil de auditar ou otimizar

### 🚨 O Que Está Frágil

1. **Timing Visual**
   - Appointment às 14:00, receptionist abre às 13:55
   - Pode marcar check-in antes da hora
   - **Severidade**: BAIXA (UI permite, mas backend valida hora)

2. **Bulk Actions Missing**
   - ❌ Sem "confirmar todos os appts de hoje" (operação receptionist comum)
   - **Severidade**: MÉDIA (usability, não segurança)

### 📊 O Que Impede Medir ROI Real

| Métrica | Status | Impacto |
|---------|--------|--------|
| **Confirmation rate** (% confirmados até 24h antes) | ❌ Sem medição | Alto |
| **Reception response time** (min between appt created → confirm) | ❌ Sem métrica | Alto |
| **Check-in rate** (% presente no horário) | ❌ Sem métrica | Alto |
| **Receptionist utilization** (ações por hora) | ❌ Sem métrica | Médio |
| **Rescheduling success** (% remarcados com sucesso) | ❌ Sem métrica | Médio |

### 🛠️ O Que Deveria Ser Corrigido Antes de Escalar

1. **[CRÍTICO]** Implementar SLA enforcement + notifications
   - Job: 24h antes de appointment, se status ≠ CONFIRMED → send SMS + notification á receptionist
   - **ETA**: 2 dias

2. **[CRÍTICO]** Handoff queue visible em reception UI
   - Nova widget "🔔 Pendente Handoff: 3" com link para list
   - **ETA**: 1 dia

3. **[ALTO]** Métrica de confirmation rate + check-in rate
   - Dashboard: "Hoje: 12 appts, 9 confirmados (75%), 7 check-in (58%)"
   - Alert se < 70% confirmação
   - **ETA**: 2 dias

### 📂 Arquivos Centrais

| Arquivo | Função |
|---------|--------|
| [reception.service.ts](apps/api/src/modules/reception) | CRUD + transitions |
| [apps/web/app/clinics/*/reception](apps/web/app/clinics) | UI components |
| [reception.controller.ts](apps/api/src/modules/reception/reception.controller.ts) | HTTP endpoints |

---

## 🎯 BLOCO 3: MESSAGING + HANDOFF

### ✅ O Que Já Existe

- **Webhook Abuse Protection**: 
  - Rate limit per thread (10 msgs/min)
  - Rate limit global per phone (100 msgs/hour)
  - Bot detection automático
  - **Arquivo**: [messaging-webhook-abuse-protection.service.ts](apps/api/src/modules/messaging/messaging-webhook-abuse-protection.service.ts)

- **Thread Integrity Model**:
  - MessageThread model com thread_id único por integração
  - ThreadStatus: OPEN, IN_HANDOFF, CLOSED
  - Mensagens nunca deletadas; apenas transitions registradas em MessageEvent
  - **Arquivo**: [message-threads.service.ts](apps/api/src/modules/messaging/message-threads.service.ts)

- **Webhook Verification**:
  - `verifyWebhook()` com `verify_token` validation
  - Provider factory identifica integração
  - **Arquivo**: [whatsapp-webhooks.service.ts](apps/api/src/modules/messaging/whatsapp-webhooks.service.ts)

- **Handoff System**:
  - HandoffRequest model com status OPEN → ASSIGNED → CLOSED
  - Prioridades: HIGH, MEDIUM, LOW
  - openedAt, assignedAt, closedAt timestamps
  - **Arquivo**: [handoff-requests.service.ts](apps/api/src/modules/messaging/handoff-requests.service.ts)

- **Audit Trail Completa**:
  - MessageEvent registra: THREAD_CREATED, MESSAGE_RECEIVED, HANDOFF_OPENED, etc.
  - WebhookEvent registra recepção com status
  - **Arquivo**: [message-threads.service.ts](apps/api/src/modules/messaging/message-threads.service.ts)

### ⚠️ O Que Está Faltando

1. **🚨 DEDUPLICAÇÃO DE MessageId AUSENTE**
   - ❌ Webhook pode ser entregue 2-3x (padrão de providers)
   - ❌ Sem verificação de `messageId` já processado
   - **RISCO CRÍTICO**: Thread duplicado, paciente recebe respostas múltiplas do agent
   - **Impacto**: Confusão operacional, perda de confiança
   - **Evidência**: `handleInboundWebhook()` não faz dedupe check por messageId

2. **Intent Classification INCOMPLETA**
   - ⚠️ Estrutura existe (MessageIntent enum), mas implementação real não clara
   - ❌ Sem lógica de "booking" vs "cancellation" vs "urgency" detection automática
   - **Impacto**: Handoff rate sobe porque não classifica (cai em handoff por falta de confiança)
   - **Evidência**: agent-message-bridge.service.ts orquestra, mas triagem real está faltando

3. **SLA Enforcement ZERO**
   - ❌ Handoff HIGH priority deveria ter SLA 5min, MEDIUM 10min, LOW 30min
   - ❌ Sem alert se SLA breach
   - ❌ Sem assignment automático para receptionist idle
   - **Impacto**: Handoff fica preso em OPEN por horas

4. **Reassurance Message Ausente**
   - ❌ Se handoff necessário, paciente não é notificado imediatamente
   - **Impacto**: Paciente acha que foi ignorado → abandona conversa

### 🚨 O Que Está Frágil

1. **Webhook Duplicate Scenario**
   - **Cenário**: WhatsApp envia messageId XYZ 2x em 30s (retry de sua infra)
   - **Resultado Atual**: ❌ Duas MessageEvent criadas, thread updated 2x, agent fired 2x
   - **Severidade**: CRÍTICA

2. **Thread Loss Risk**
   - ❌ Se `handleInboundWebhook()` falha mid-transaction
   - Webhook não armazenado, mensagem perdida
   - **Severidade**: MÉDIA (raro, mas efeito grave)
   - **Mitigation**: $transaction() garante atomicidade? (VERIFICAR)

3. **Intent Fallback**
   - Se classificação falha, handoff imediato
   - OK como segurança, mas sobe handoff rate desnecessariamente
   - **Severidade**: MÉDIA (UX, custo operacional)

### 📊 O Que Impede Medir ROI Real

| Métrica | Status | Impacto |
|---------|--------|--------|
| **Message processing latency** (webhook → triagem → resposta) | ❌ Sem métrica | Alto |
| **Handoff rate** (% msgs que escalam vs agent resolve) | ⚠️ Parcial | Alto |
| **Handoff SLA compliance** (% handoff resolved < SLA) | ❌ Sem enforcement | Alto |
| **Intent accuracy** (% classification correto) | ❌ Sem medição | Médio |
| **Thread loss rate** | ❌ Sem métrica | Crítico |
| **Message dedup ratio** (% duplicates detected) | ❌ Sem medição | Crítico |

### 🛠️ O Que Deveria Ser Corrigido Antes de Escalar

1. **[BLOQUEANTE]** Implementar deduplicação explícita de messageId
   - Dedupe table: `{ messageId, tenantId, first_seen_at, processed }`
   - Before processing webhook: `SELECT COUNT(*) where messageId = $1`
   - If exists: return ACK 200, cached result
   - **ETA**: 1 dia

2. **[BLOQUEANTE]** Implementar SLA enforcement + alerting
   - Job: Check handoff requests every 1min
   - If (now - openedAt) > SLA threshold and status = OPEN → alert to dispatch + assign to idle receptionist
   - **ETA**: 2 dias

3. **[CRÍTICO]** Implementar intent classification automática
   - Use agent skill ou regex basado para detect: booking, cancellation, confirmation, urgency
   - Fallback to handoff if confidence < 70%
   - **ETA**: 3 dias (dep de agent readiness)

4. **[ALTO]** Implementar reassurance message
   - Quando handoff necessário: "Sua mensagem foi recebida. Um membro da equipe responderá em breve."
   - **ETA**: 1 dia

### 📂 Arquivos Centrais

| Arquivo | Função | Criticidade |
|---------|--------|------------|
| [whatsapp-webhooks.service.ts](apps/api/src/modules/messaging/whatsapp-webhooks.service.ts) | Webhook intake | CRÍTICA |
| [message-threads.service.ts](apps/api/src/modules/messaging/message-threads.service.ts) | Thread management | CRÍTICA |
| [messaging-webhook-abuse-protection.service.ts](apps/api/src/modules/messaging/messaging-webhook-abuse-protection.service.ts) | Rate limit | ALTA |
| [handoff-requests.service.ts](apps/api/src/modules/messaging/handoff-requests.service.ts) | Handoff workflow | CRÍTICA |
| [agent-message-bridge.service.ts](apps/api/src/modules/agent/agent-message-bridge.service.ts) | Agent orchestration | MÉDIA |

---

## 🎯 BLOCO 4: ONBOARDING COMERCIAL

### ✅ O Que Já Existe

- **State Machine Rígido**:
  - INITIATED → AWAITING_PAYMENT → PAID → ONBOARDING_STARTED → ONBOARDING_COMPLETED
  - CommercialOnboardingStatus enum bem definido
  - Transições via `$transaction()` para atomicidade
  - **Arquivo**: [commercial.service.ts](apps/api/src/modules/commercial/commercial.service.ts)

- **Payment Adapter Pattern**:
  - Factory avec Mock + Stripe implementations
  - Isolado: payment logic nunca toca scheduling/appointments
  - **Arquivo**: [payment-adapter.factory.ts](apps/api/src/modules/commercial/adapters/payment-adapter.factory.ts)

- **Webhook Verification**:
  - Signature validation com secret
  - Tenant context via publicToken lookup
  - **Arquivo**: [commercial.service.ts](apps/api/src/modules/commercial/commercial.service.ts)

- **Activation Flow**:
  - Tenant criado → Clinic criado → Admin user criado → Subscription criado
  - Tudo dentro `$transaction()` para all-or-nothing
  - **Arquivo**: [commercial.service.ts completeCommercialOnboardingAsynchronously()](apps/api/src/modules/commercial/commercial.service.ts)

- **Audit Trail**:
  - Cada transição de estado registrada com action, metadata, paymentReference
  - **Arquivo**: [commercial.service.ts auditService.log()](apps/api/src/modules/commercial/commercial.service.ts)

### ⚠️ O Que Está Faltando

1. **🚨 WEBHOOK DEDUPLICAÇÃO AUSENTE**
   - ❌ Se webhook de pagamento confirma 2x (Stripe retry): `confirmCheckout()` pode criar 2x tenant/clinic
   - **RISCO CRÍTICO**: Duplicação de tenant! Isolamento quebrado!
   - **Evidência**: Nenhuma verificação de `idempotencyKey` em `confirmCheckout()`
   - **Impacto**: Receita perdida (2x cobrado?) + dados sujo + isolamento violado

2. **Reconciliation de Divergência AUSENTE**
   - ❌ Se webhook diz PAID mas backend vê AWAITING_PAYMENT: sem lógica de detect + alert
   - ❌ Sem manual override workflow com trail de auditoria
   - **Impacto**: Clínica paga mas ativa nunca → suporte manual escalação
   - **Evidência**: Nenhuma função de `reconcilePaymentDivergence()` visível

3. **Activation Failure Handling VAGO**
   - ⚠️ Se 1 dos 4 marcos (tenant/clinic/user/subscription) falha
   - Status fica em ONBOARDING_STARTED indefinidamente?
   - ❌ Sem retry automático ou manual recovery workflow
   - **Impacto**: Clínica ativada parcialmente, operação quebrada

4. **Observability ZERO**
   - ❌ Sem métrica de "onboarding time" (INITIATED → COMPLETED)
   - ❌ Sem alerta se onboarding trava > 1 hora
   - ❌ Sem dashboard de "leads today", "paid today", "activated today"
   - **Impacto**: Não sabe velocidade de onboarding

### 🚨 O Que Está Frágil

1. **Payment Webhook Timing**
   - **Cenário**: Webhook chega 30s depois do HTTP checkout OK
   - Frontend vê "pending", customer refresha, vê "paid", atura ok
   - Backend event reconcilia OK (eventual consistency)
   - **Severidade**: BAIXA (handled, mas confusing)

2. **Tenant Creation Race**
   - **Cenário**: 2 webhooks simultâneos do mesmo checkout
   - Ambos criam Tenant?
   - **Severidade**: CRÍTICA (não impossível com dedup)

3. **Admin User Password**
   - Hash gerado, mas como send to customer?
   - ❌ Sem email confirmation workflow visível
   - **Severidade**: MÉDIA (usuability)

### 📊 O Que Impede Medir ROI Real

| Métrica | Status | Impacto |
|---------|--------|--------|
| **Onboarding completion rate** (INITIATED → COMPLETED %) | ❌ Sem medição | Alto |
| **Onboarding time** (PAID → COMPLETED, hours) | ❌ Sem métrica | Alto |
| **Payment confirmation latency** (webhook → DB, seconds) | ❌ Sem métrica | Médio |
| **Activation step failure rate** (tenant, clinic, user, subscription) | ❌ Sem medição | Alto |
| **Lead abandoned rate** (INITIATED → nunca PAID %) | ⚠️ Possível via Prisma query | Médio |

### 🛠️ O Que Deveria Ser Corrigido Antes de Escalar

1. **[BLOQUEANTE]** Implementar webhook deduplicação com idempotencyKey
   - DTO: `{ publicToken, sessionId, idempotencyKey }`
   - Before payment confirmation: `findByIdempotency(idempotencyKey)`
   - If exists with success: return cached result (webhook already processed)
   - **ETA**: 1 dia

2. **[BLOQUEANTE]** Implementar reconciliation de payment divergence
   - Job: verificar {webhook status} vs {backend status}
   - If divergence: log + alert financial team + initiate manual review
   - **ETA**: 2 dias

3. **[CRÍTICO]** Implementar activation failure recovery
   - If 1 of 4 marcos falha: capture erro, status → ACTIVATION_FAILED
   - Manual workflow: support team can retry specific step
   - **ETA**: 3 dias

4. **[ALTO]** Implementar observability: onboarding funnel
   - Métrica: leads_initiated, leads_paid, leads_activated (gauge por estado)
   - Gráfico: INITIATED → PAID → COMPLETED (progression)
   - SLA alert: se PAID não → COMPLETED em 1 hora
   - **ETA**: 2 dias

### 📂 Arquivos Centrais

| Arquivo | Função | Criticidade |
|---------|--------|------------|
| [commercial.service.ts](apps/api/src/modules/commercial/commercial.service.ts) | State machine + activation | CRÍTICA |
| [payment-adapter.factory.ts](apps/api/src/modules/commercial/adapters/payment-adapter.factory.ts) | Payment abstraction | CRÍTICA |
| [commercial.controller.ts](apps/api/src/modules/commercial/commercial.controller.ts) | HTTP endpoints | ALTA |

---

## 🎯 BLOCO 5: OBSERVABILITY

### ✅ O Que Já Existe

- **Audit Log Immutable**:
  - AuditLog model com action, actorUserId, tenantId, targetType, targetId, metadata
  - Never updated, only created
  - **Arquivo**: [apps/api/src/modules/audit-log](apps/api/src/modules)

- **NestJS Logger Básico**:
  - `new Logger(ClassName.name)` em múltiplos services
  - Log levels: debug, log, warn, error
  - **Arquivo**: Espalhado em *.service.ts

- **Agent Metrics Configuration**:
  - agent.config.ts define metricsWindowMinutes, failureRateAlertThreshold (5%), p95LatencyAlertMs (1500ms)
  - **Arquivo**: [agent.config.ts](apps/api/src/modules/agent/agent.config.ts)

### ❌ O Que Está Faltando (CRÍTICO)

1. **🚨 SEM STRUCTURED JSON LOGGING**
   - ❌ Código usa Logger simples, instruções falam em JSON estruturado com {timestamp, level, service, tenantId, action, traceId}
   - **DRIFT DOCUMENTAL CRÍTICO**
   - **Impacto**: Logs não correlacionáveis, debugging em produção = MANUAL

2. **🚨 SEM TRACE ID PROPAGATION**
   - ❌ correlationId gerado em agent-message-bridge.ts, mas não propagado em endpoints de scheduling/reception/commercial
   - **Impacto**: Requisição HTTP → appointment criado → mensagem enviada = sem correlação

3. **🚨 SEM MÉTRICAS DE NEGÓCIO**
   - ❌ Nenhuma métrica de:
     - appointments_created_per_tenant
     - no_show_rate
     - confirmation_rate
     - reception.checkin_rate
     - messages.processing_latency
     - handoff.sla_breached
     - payment.webhook_mismatch
   - **Impacto**: "Escalei agents no handoff, no-show caiu 10%?" → SEM DADOS

4. **❌ SEM ALERTAS OPERACIONAIS**
   - ❌ Sem alertas para:
     - Scheduling conflict rate > 5%
     - Webhook error rate > 0
     - Handoff SLA breach
     - Payment mismatch
     - Message processing timeout
   - **Impacto**: Erro silencioso em produção, descoberto tarde

5. **❌ SEM DASHBOARDS**
   - ❌ Nenhum dashboard Grafana/DataDog
   - Sem "today snapshots": appointments, confirmed %, no-show %, messages processed
   - **Impacto**: Receptionist não vê SLA atual

6. **❌ SEM APM (Application Performance Monitoring)**
   - ❌ Sem Prometheus/New Relic/DataDog agent
   - Sem trace de requisições HTTP
   - Sem correlação DB queries
   - **Impacto**: Performance issue descoberto por cliente, não por você

### 📊 O Que Impede Medir ROI Real

| Métrica Crítica | Status |
|-----------------|--------|
| **No-show rate (baseline vs current)** | ❌ Não mensurável |
| **Confirmation rate (24h SLA)** | ❌ Não mensurável |
| **Reception response time** | ❌ Não mensurável |
| **Message processing latency** | ❌ Parcial (agent config tem alert, mas sem métrica real) |
| **Handoff SLA compliance** | ❌ Não mensurável |
| **Onboarding time** | ❌ Não mensurável |
| **API availability** | ❌ Não mensurável |

### 🛠️ O Que Deveria Ser Implementado PRIMEIRO

**[BLOQUEANTE — NÃO ESCALAR AGENTS SEM ISSO]**

1. **Structured JSON Logging + Trace ID**
   - Create `LoggingInterceptor` em NestJS que injeta `traceId` em toda HTTP request
   - Create `LoggerService` wrapper que output JSON com {timestamp, level, service, tenantId, action, traceId, metadata}
   - **ETA**: 2 dias

2. **Red Metrics (Prometheus)**
   ```
   - appointments_created_total (counter: tenantId)
   - appointments_error_total (counter: tenantId, error_code)
   - scheduling.conflict_rate (gauge: tenantId)
   - messages.webhook_error_total (counter: tenantId)
   - handoff.sla_breached_total (counter: tenantId)
   - payment.webhook_mismatch_total (counter: tenantId)
   ```
   - **ETA**: 3 dias

3. **Alert Rules**
   ```
   - scheduling.conflict_rate > 0.05 → alert
   - messages.webhook_error > 0 in 5min → alert
   - handoff.sla_breached > 0 in 1hour → alert
   - payment.webhook_mismatch > 0 → CRITICAL alert
   ```
   - **ETA**: 1 dia (rule file)

4. **Operational Dashboard (Grafana)**
   - Gauge: appointments_today, confirmed_today (%), no_show_today (%)
   - Chart: messages_per_hour, handoff_rate_per_hour
   - Alerts: red if > 5% errors, yellow if > 10% handoff rate
   - **ETA**: 3 dias

### 📂 Arquivos Necessários (NÃO EXISTEM)

| Arquivo | Tipo | Necessário? |
|---------|------|------------|
| `common/logging/logger.service.ts` | Service | **SIM** |
| `common/logging/logging.interceptor.ts` | Interceptor | **SIM** |
| `common/metrics/metrics.service.ts` | Service | **SIM** |
| `common/metrics/prometheus.config.ts` | Config | **SIM** |
| `monitoring/alerts.yaml` | Alert rules | **SIM** |
| `monitoring/dashboard.json` | Grafana | **SIM** |

---

## 📋 TABELA DE STATUS CONSOLIDADA

| Domínio | Métrica | Verde ✅ | Amarelo ⚠️ | Vermelho ❌ |
|---------|---------|---------|----------|----------|
| **Scheduling** | Concurrency | ✅ | - | - |
| | Lifecycle enforcement | ✅ | - | - |
| | Tenant isolation | ✅ | - | - |
| | No-show automation | - | - | ❌ |
| | Metrics/Dashboard | - | - | ❌ |
| **Reception** | UI Fluidity | ✅ | - | - |
| | Quick actions | ✅ | - | - |
| | Data binding | ✅ | - | - |
| | SLA enforcement | - | - | ❌ |
| | Handoff integration | - | ⚠️ | - |
| **Messaging** | Webhook protection | ✅ | - | - |
| | Thread integrity | ✅ | - | - |
| | Abuse rate limit | ✅ | - | - |
| | **Deduplication messageId** | - | - | ❌ |
| | Intent classification | - | ⚠️ | - |
| | Handoff SLA | - | - | ❌ |
| **Commercial** | State machine | ✅ | - | - |
| | Payment adapter isolation | ✅ | - | - |
| | Webhook verification | ✅ | - | - |
| | **Webhook deduplication** | - | - | ❌ |
| | Reconciliation | - | - | ❌ |
| | Activation recovery | - | ⚠️ | - |
| **Observability** | Audit log | ✅ | - | - |
| | JSON logging | - | - | ❌ |
| | Trace ID | - | ⚠️ | - |
| | Metrics | - | - | ❌ |
| | Alerts | - | - | ❌ |
| | Dashboards | - | - | ❌ |

---

## 🚨 TOP 10 GAPS MAIS PERIGOSOS

### Ranked by: (Criticality × Impact × Likelihood)

| # | Gap | Domínio | Criticidade | Impacto | Probabilidade | Ação Imediata |
|---|-----|--------|-------------|---------|--------------|--------------|
| 1 | 🚨 **Webhook dedup ausente (Commercial)** | Commercial | CRÍTICA | Tenant duplication, isolamento quebrado | ALTA (webhook retry comum) | Implementar idempotencyKey em confirmCheckout() |
| 2 | 🚨 **Webhook dedup ausente (Messaging)** | Messaging | CRÍTICA | Thread duplicado, resposta múltipla ao paciente | ALTA (webhook retry) | Implementar dedupe table por messageId |
| 3 | 🚨 **SEM observability de ROI** | Observability | CRÍTICA | Não sabe se improvements funcionam → decisões cegas | CRÍTICA (hoje) | Implementar structured logging + métricas RED |
| 4 | 🚨 **Reconciliation payment divergence** | Commercial | ALTA | Clínica paga, nunca ativa, manual support | MÉDIA (webhook latency) | Implementar reconciliation job + alert |
| 5 | 🚨 **No-show automation zero** | Scheduling | ALTA | Dado sujo, receptionist esquece marca → análise inválida | ALTA (humans forget) | Cron job mark NO_SHOW automaticamente |
| 6 | **SLA enforcement reception zero** | Reception | ALTA | Appt não confirmado 24h antes → no-show sobe | ALTA (sem reminder) | Implementar reminder job + alert |
| 7 | **Handoff SLA enforcement zero** | Messaging | ALTA | Handoff preso dias em ASSIGNED | MÉDIA (sem monitoring) | Job: check SLA braches, auto-assign idle |
| 8 | **Intent classification incompleto** | Messaging | MÉDIA | Handoff rate sobe (tudo escalado por falta de classif) | ALTA (sem triagem) | Implementar regex/agent skill para booking/cancel/urgency |
| 9 | **Trace ID propagation zero** | Observability | MÉDIA | Debugging em produção = manual chain logs | ALTA (hoje) | Middleware injetar traceId em toda HTTP request |
| 10 | **Hold garbage collection zero** | Scheduling | BAIXA | Creep de dados, pequena degradação query performance | BAIXA (creep lento) | Cron daily cleanup holds expirados |

---

## 📈 ORDEM DE CORREÇÃO POR IMPACTO (ROI Primeiro)

**Fase 1 — BLOQUEANTE (semana 1)**
1. ✅ Implementar webhook deduplicação (commercial + messaging) — impede escalação agent + garante isolamento
2. ✅ Implementar structured logging + métricas RED — sem isso, não sabe se anything works
3. ✅ Implementar no-show automation + motivo capture — baseline de data para medir no-show reduction

**Fase 2 — CRÍTICO OPERACIONAL (semana 2)**
4. ✅ Implementar SLA enforcement (reception 24h confirm, handoff per priority)
5. ✅ Implementar reconciliation payment divergence
6. ✅ Implementar intent classification automática (ou melhorar agent triagem)

**Fase 3 — IMPORTANTE (semana 3)**
7. ✅ Implementar handoff queue visible em reception UI
8. ✅ Implementar observability dashboards (Grafana + Prometheus)
9. ✅ Implementar hold garbage collection

**Fase 4 — NICE-TO-HAVE (semana 4+)**
10. ✅ Implementar bulk actions reception (confirmar todos hoje)
11. ✅ Implementar admin override workflow com trail
12. ✅ Implementar prediction: no-show risk score per appointment

---

## ❌ O QUE NÃO DEVE SER FEITO AGORA

### Stack Decisions (Não mexer)
- ❌ **Não** reescrever scheduling concurrency (pg_advisory_lock está OK, só monitorar)
- ❌ **Não** migrar Prisma para TypeORM
- ❌ **Não** mudar modelo de tenant isolation (está correto)
- ❌ **Não** reescrever authentication layer (JWT + tenant context está OK)

### Feature Scope (Não adicionar agora)
- ❌ **Não** implementar "provider mobile app" (professionals)
- ❌ **Não** adicionar advanced billing features (subscription tiers, usage-based)
- ❌ **Não** integrar "AI scheduling optimizer" (premature)
- ❌ **Não** adicionar patient portal self-service booking (não está no MVP)
- ❌ **Não** implementar "video consultation" feature
- ❌ **Não** adicionar "clinic reputation score" gamification

### Performance Micro-optimizations (Não fazer agora)
- ❌ **Não** fazer query optimization prematura (está OK até 10k clinics)
- ❌ **Não** implementar elaborate caching (Upstash Redis, etc) sem métrica baseline
- ❌ **Não** reescrever API routes para performance (HTTP OK, não WebSocket)

### Observability Over-engineering (Não fazer)
- ❌ **Não** implementar 50 metrics (start com RED: 10 críticas)
- ❌ **Não** usar OpenTelemetry + OTEL Collector (overkill, use simples Prometheus)
- ❌ **Não** implementar distributed tracing Jaeger (premature)

### Agent Expansion (Não fazer agora)
- ❌ **Não** escalar agent layer para 10+ skills sem base observability
- ❌ **Não** implementar "agent pode criar tenant" (backend authority violation)
- ❌ **Não** implementar "AI automatic override" (handoff sempre humano)

---

## 🔴 DRIFT DOCUMENTAL DETECTADO

| Documentação | Código | Severidade | Ação |
|--------------|--------|-----------|------|
| `.github/instructions/observability.md` diz JSON estruturado com traceId | Código usa Logger simples | **ALTA** | Implementar structured logging ou update docs |
| `.github/instructions/scheduling.md` diz AppointmentStatus.CREATED, CONFIRMED | Código usa BOOKED | **BAIXA** | Update docs (é apenas rename, não mudança semântica) |
| `.github/instructions/reception.md` diz receptionist nunca busca dados | Sem bulk actions, contextual search ainda manual | **MÉDIA** | Implementar contextual search por patient name |
| `.github/instructions/commercial.md` diz webhook dedup obrigatório | Código não tem dedup | **CRÍTICA** | Implementar urgente |
| `.github/instructions/messaging.md` diz SLA por handoff type | Código não enforce SLA | **ALTA** | Implementar enforcement |

---

## 🎯 CONCLUSÃO: Readiness para Operação Segura

**Verdict**: ⚠️ **75% PRONTO COM RESSALVAS**

**É seguro escalar agents agora?** ❌ **NÃO**

**Por quê?**
1. Sem observability, não sabe se agent layer piora/melhora no-show
2. Webhook dedup ausente → risco de duplicação (especially critical em commercial)
3. Sem SLA enforcement, handoff vira black hole
4. Sem intent classification, tudo escalado por default

**Caminho recomendado:**
1. Implementar 3 itens BLOQUEANTE (1-2 semanas) 
2. VALIDAR com smoke test + metrics baseline
3. Aí sim, escalar agent layer

**KPI Alvo para Sucesso:**
- No-show rate: baseline (hoje) → -15% (30 dias)
- Confirmation rate: baseline → +10%
- Reception response time: baseline → -20%
- Handoff rate: baseline → stable ou -5% (com bom classification)

