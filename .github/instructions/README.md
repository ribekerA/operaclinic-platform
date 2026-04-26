---
name: 📍 Instructions Index - Path-Specific Domains
description: Índice de instruções path-specific para cada domínio do OperaClinic
---

# 📍 Instructions Index — Path-Specific Domains

Este diretório `.github/instructions/` contém regras obrigatórias e padrões para cada domínio crítico do OperaClinic SaaS.

**Para evoluir qualquer domínio, LEA SEMPRE a instrução correspondente ANTES de implementar.**

---

## 📋 Instruções por Domínio

### 1️⃣ **Scheduling** — Backend Authority & Concurrency
**Arquivo**: [scheduling.instructions.md](scheduling.instructions.md)  
**Escopo**:
- `apps/api/src/modules/scheduling/**`
- `apps/web/app/**/scheduling*`

**Foco**:
- ✅ Backend é autoridade absoluta de disponibilidade, hold, conflito
- ✅ Idempotência e transação atômica
- ✅ Lifecycle rígido (CREATED → CONFIRMED → CHECKED_IN → COMPLETED)
- ✅ Timezone normalizado UTC
- ✅ Concorrência: race conditions tratadas

**Principais regras**:
- Não confirmar slot sem backend validar no momento
- Hold com `expiresAt` obrigatório
- Não pular etapas de lifecycle
- Transação `$transaction()` para toda operação crítica

---

### 2️⃣ **Messaging** — WhatsApp Deduplication & Thread Integrity
**Arquivo**: [messaging.instructions.md](messaging.instructions.md)  
**Escopo**:
- `apps/api/src/modules/messaging/**`
- `apps/api/src/modules/agent/*bridge*`
- `prompts/codex/*whatsapp*`

**Foco**:
- ✅ Deduplicação por `messageId` — nenhuma msg processada 2x
- ✅ Thread integrity — cada thread é imutável, nunca se apaga
- ✅ Webhook signature validation
- ✅ Handoff automático (confiança < 70%, urgência, ambiguidade)
- ✅ Auditoria completa: inbound → outbound com `messageId`

**Principais regras**:
- Webhook sem assinatura válida = reject 401
- Dedupe table obrigatória
- Thread é source of truth, nunca perde contexto
- Rate limit por thread + global

---

### 3️⃣ **Reception** — Operational Fluidity & State Management
**Arquivo**: [reception.instructions.md](reception.instructions.md)  
**Escopo**:
- `apps/api/src/modules/reception/**`
- `apps/web/app/clinics/*/reception*`

**Foco**:
- ✅ Receptionist NÃO busca dados manualmente
- ✅ Dashboard mostra contexto pronto (urgências, hoje, histórico)
- ✅ Ações rápidas < 1s (confirm, check-in, reschedule, cancel)
- ✅ Histórico auditável, sem ambiguidade
- ✅ No-show detection automático

**Principais regras**:
- Contexto sempre pronto: paciente, histórico, ações
- Confirmar = transiciona CREATED → CONFIRMED + envia SMS/WhatsApp
- Check-in validata hora <= appointment time
- No-show detectado > 15min no-check-in

---

### 4️⃣ **Commercial** — Webhook Reliability & Activation Integrity
**Arquivo**: [commercial.instructions.md](commercial.instructions.md)  
**Escopo**:
- `apps/api/src/modules/commercial/**`
- `apps/api/src/modules/platform/**`
- `apps/web/app/platform/**`

**Foco**:
- ✅ Nunca assumir confirmação sem fato real (hierarquia confiança)
- ✅ Webhook signature validation + deduplicação
- ✅ State machine rígido: INITIATED → AWAITING_PAYMENT → PAID → ONBOARDING_STARTED → ONBOARDING_COMPLETED
- ✅ Ativação = todos os 4 marcos completos
- ✅ Manual reconciliation com trail de auditoria

**Principais regras**:
- Hierarquia confiança: backend state > webhook reconciliado > webhook só > relato manual
- Toda transição via `$transaction()`
- Ativação incompleta ≠ ativação
- Webhook mismatch = alert crítico + manual reviiw

---

### 5️⃣ **Agent Layer** — Guardrails & Fallback Authority
**Arquivo**: [agent-layer.instructions.md](agent-layer.instructions.md)  
**Escopo**:
- `apps/api/src/modules/agent/**`
- `prompts/codex/**`
- `prompts/copilot/**`

**Foco**:
- ✅ Agent é helper, NUNCA decision owner
- ✅ Guardrails explícitos: inputs, outputs, ações bloqueadas
- ✅ Fallback automático: confiança < 70% → handoff
- ✅ Output contract obrigatório: execution_id, confidence, reason, audit
- ✅ Tenant isolation garantida

**Principais regras**:
- Agent NÃO confirma slot (só backend)
- Confiança < 70% → mandatório handoff
- Nenhuma decisão sensível (pagamento, status, policy)
- Output sempre inclui: next_action, confidence, metadata, guardrails_respected, escalation_trigger

---

### 6️⃣ **Frontend Clinic** — UX Fluidity & Data Binding
**Arquivo**: [frontend-clinic.instructions.md](frontend-clinic.instructions.md)  
**Escopo**:
- `apps/web/app/clinics/**`
- `apps/web/components/**`
- `apps/web/hooks/**`
- `apps/web/lib/**`

**Foco**:
- ✅ UX fluida: contexto sempre pronto, sem busca manual
- ✅ Data binding seguro: `tenantId` validado URL + session
- ✅ Isolamento tenant: 2 clínicas no mesmo browser → zero cross-contamination
- ✅ Quick actions < 1s (confirm, check-in, reschedule, cancel)
- ✅ Session guard + middleware de auth

**Principais regras**:
- URL sempre inclui `clinicId`
- Context provider valida tenant + clinic match
- Nenhuma query sem `tenantId`
- Teste E2E: 2 clínicas, zero vazamento
- Lazy loading quando apropriado

---

### 7️⃣ **Observability** — Structured Logging & Metrics
**Arquivo**: [observability.instructions.md](observability.instructions.md)  
**Escopo**:
- `apps/api/src/common/**`
- `apps/api/src/**/*.service.ts`
- `docs/PRODUCTION_READINESS_RUNBOOK.md`

**Foco**:
- ✅ Logs estruturados JSON inclui: timestamp, level, service, tenantId, action, traceId
- ✅ TraceId propaga toda requisição (correlation)
- ✅ Métricas por fluxo: appointments, messages, handoffs, errors
- ✅ Alertas automáticos: failure rate, latency, saturation
- ✅ Dashboards 24/7: operacional + troubleshooting

**Principais regras**:
- Toda log entry é JSON com tenantId + traceId
- Nenhuma log genérica ("changed", "updated"); sempre específico
- Métricas: RED (errors, latency, saturation) + custom (no-show %, handoff rate)
- Alertas críticos: payment mismatch, message error, handoff SLA breach

---

## 🔗 Relacionamento entre Domínios

```
┌─────────────────────────────────────────────────────┐
│             SCHEDULING AUTHORITY                     │
│            (backend is source of truth)             │
├─────────────────────────────────────────────────────┤
│  ↓ provides slots        ↓ listens for changes     │
│                                                     │
│ RECEPTION          MESSAGING           AGENT LAYER
│  (fluid UI)   ←→  (triagem/handoff) ←→ (guardrails)
│                          ↓                          │
│                    COMMERCIAL/PAYMENTS              │
│                 (always separate, no side effects)  │
│                          ↓                          │
│                    OBSERVABILITY                    │
│              (logs all above domains)               │
└─────────────────────────────────────────────────────┘
```

---

## 📌 Quando usar cada instrução

| Tarefa | Instrução(ões) |
|--------|-->|
| Adicionar novo slot availability filter | **Scheduling** |
| Tratar mensagem WhatsApp tardia | **Messaging**, Observability |
| Implementar quick ação "confirmar" | **Reception**, Frontend Clinic |
| Debugar no-show alto | **Scheduling**, Observability |
| Integrar novo payment provider | **Commercial**, Observability |
| Criar novo agent skill | **Agent Layer**, Contrato Saída |
| Melhorar performance reception | **Reception**, Frontend Clinic, Observability |
| Revisar isolamento multi-tenant | Todas (cross-check) |

---

## ✅ Checklist Antes de Merge (Para Todo PR)

1. **Identifique domínios afetados** → leia instrução(ões) correspondente(s)
2. **Valide arquitetura** → respeita backend authority? multitenancy? transação?
3. **Adicione tests** → unit + integration + smoke E2E
4. **Implemente observabilidade** → logs estruturados + métricas
5. **Atualize docs** → se regra mudou, sinalizar drift
6. **Rollout seguro** → plano rollback, alertas, métricas

---

## 📚 Documentação Complementar

| Arquivo | Escopo |
|---------|--------|
| [.github/copilot-instructions.md](.github/copilot-instructions.md) | Regras gerais, escalação, exceções |
| [.github/instructions/saas-clinica-operacao.instructions.md](.github/instructions/saas-clinica-operacao.instructions.md) | Operação geral, RBAC, handoff |
| [.github/instructions/billing-ativacao-integracoes.instructions.md](.github/instructions/billing-ativacao-integracoes.instructions.md) | Billing, payment, ativação (old — update to Commercial) |
| [.github/instructions/contrato-saida-agentes-skills.instructions.md](.github/instructions/contrato-saida-agentes-skills.instructions.md) | Contrato saída agents (output format) |
| [docs/ARCHITECTURE_DECISIONS_IN_CODE.md](docs/ARCHITECTURE_DECISIONS_IN_CODE.md) | Enforcement de decisões no código |
| [README.md](README.md) | Setup, smoke E2E, comandos |

---

**Versão**: 1.0  
**Última atualização**: 2026-04-04  
**Mantido por**: Tech team OperaClinic  
**Review**: Trimestral ou após cada release major
