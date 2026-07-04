# OperaClinic — Architecture Audit

**Data:** 2026-07-02  
**Escopo:** Auditoria read-only da plataforma para planejamento do pacote de demo ao vivo.  
**Formato:** Prompt 0 do pacote "Demo Ao Vivo OperaClinic".

---

## 1. Resumo da Stack

| Camada | Tecnologia | Versão | Observações |
|---|---|---|---|
| Monorepo | Turborepo + pnpm | pnpm 10 | `inject-workspace-packages=true` |
| API | NestJS | 10.x | `apps/api`, porta 3001 |
| ORM | Prisma | 6.x | PostgreSQL, `prisma migrate deploy` no startup |
| Web | Next.js | 15.x | `apps/web`, porta 3000 |
| Mobile | Flutter | protótipo | `apps/professional-mobile` — **fora do escopo do piloto** |
| Banco | PostgreSQL | hosted Render | free-tier, dorme após 15 min inatividade |
| Infra | Render Blueprint | — | `render.yaml` define API + Web como serviços free |
| CI/CD | GitHub Actions | — | `POST /v1/services/{id}/deploys` via Render API |
| Auth | JWT Bearer | — | multi-tenant RBAC, `RoleCode` enum no Prisma |
| Observability | RequestId + logging interceptors | — | `TraceContextService`, `GlobalExceptionFilter` |
| Scripting | Node.js `.mjs` | 20+ (nativo) | `node:fetch`, `node:util.parseArgs`, sem deps extras |

**Global prefix:** `api/v1` (configurável via `app.prefix`)  
**CORS:** Aceita `WEB_URL` env + `localhost:3000`; produção requer `WEB_URL=https://operaclinic-web.onrender.com`

---

## 2. Diagrama Textual do Modelo de Dados

```
Tenant (id, slug, name, status, timezone)
│
├── Clinic (id, tenantId¹, displayName, contactPhone, timezone, isActive)
│
├── Unit[] (id, tenantId, name)
│
├── ConsultationType[] (id, tenantId, name, durationMinutes,
│     bufferBeforeMinutes, bufferAfterMinutes, priceCents, isActive)
│
├── Professional[] (id, tenantId, userId?, fullName, visibleForSelfBooking)
│   ├── ProfessionalSchedule[] (id, tenantId, professionalId, unitId,
│   │     dayOfWeek, startTime, endTime, slotIntervalMinutes, validFrom, validTo)
│   └── ScheduleBlock[] (id, tenantId, professionalId, startsAt, endsAt)
│
├── Patient[] (id, tenantId, fullName, birthDate, intentHistory:Json, isActive,
│     mergedIntoPatientId?)
│   └── PatientContact[] (id, tenantId, patientId, type:PHONE|WHATSAPP,
│         value, normalizedValue, allowAutomatedMessaging)
│
├── SlotHold[] (id, tenantId, professionalId, consultationTypeId,
│     startsAt, endsAt, durationMinutes,
│     status:ACTIVE|CONSUMED|CANCELED|EXPIRED, expiresAt)
│
├── Appointment[] (id, tenantId, patientId, professionalId,
│     consultationTypeId, slotHoldId¹, unitId?,
│     startsAt, endsAt, durationMinutes,
│     status:AppointmentStatus, idempotencyKey, cancellationReason?)
│   └── AppointmentStatus: BOOKED → CONFIRMED → CHECKED_IN → CALLED
│         → IN_PROGRESS → AWAITING_CLOSURE → AWAITING_PAYMENT
│         → COMPLETED / RESCHEDULED / CANCELED / NO_SHOW
│
├── IntegrationConnection[] (id, tenantId, provider, status,
│     wabaId, phoneNumberId, accessToken)
│
├── MessageThread[] (id, tenantId, patientId?, integrationConnectionId,
│     channel, status:OPEN|IN_HANDOFF|CLOSED, normalizedContactValue, lastIntent)
│   ├── MessageEvent[] (id, threadId, direction, content, agentExecutionId?)
│   └── HandoffRequest[] (id, tenantId, threadId,
│         status:OPEN|ASSIGNED|CLOSED, source:MANUAL|AUTOMATIC,
│         priority:HIGH|MEDIUM|LOW)
│
├── AgentExecution[] (id, tenantId, threadId, agent:CAPTACAO|AGENDAMENTO,
│     status, correlationId)
│
└── WebhookEvent[] (id, tenantId, provider, type, payload:Json, processed)

¹ relação unique (1:1)
```

---

## 3. Estado das 4 Operações de Agenda

| Operação | Status | Endpoint | Arquivo |
|---|---|---|---|
| Consultar disponibilidade | **EXISTE** | `GET /api/v1/reception/availability` | `apps/api/src/modules/reception/reception.controller.ts:68` |
| Criar agendamento | **EXISTE** | `POST /api/v1/reception/appointments` | `apps/api/src/modules/reception/reception.controller.ts:90` |
| Reagendar | **EXISTE** | `PATCH /api/v1/reception/appointments/:id/reschedule` | `apps/api/src/modules/reception/reception.controller.ts:98` |
| Cancelar | **EXISTE** | `PATCH /api/v1/reception/appointments/:id/cancel` | `apps/api/src/modules/reception/reception.controller.ts:107` |

**Operações adicionais existentes no ReceptionController:**

| Operação | Endpoint |
|---|---|
| Detalhe do agendamento | `GET /api/v1/reception/appointments/:id` |
| Confirmar | `PATCH /api/v1/reception/appointments/:id/confirm` |
| Check-in | `PATCH /api/v1/reception/appointments/:id/check-in` |
| No-show | `PATCH /api/v1/reception/appointments/:id/no-show` |
| Atualizar status (genérico) | `PATCH /api/v1/reception/appointments/:id/status` |
| Dashboard do dia | `GET /api/v1/reception/dashboard` |
| Agenda do dia | `GET /api/v1/reception/day-agenda` |
| Busca de pacientes | `GET /api/v1/reception/patients` |

**Endpoints de agente existentes (autenticados por JWT+RBAC):**

| Endpoint | Função |
|---|---|
| `POST /api/v1/agent/captacao/execute` | Executa agente de captação de lead |
| `POST /api/v1/agent/agendamento/execute` | Executa agente de agendamento |

> Os endpoints de agente para o demo ao vivo (Prompt 1) serão novos endpoints em `/api/agent/v1` com autenticação por API Key — esses **não existem ainda**.

---

## 4. Instruções de Execução Local

### Pré-requisitos

- Node.js 20+ (`node --version`)
- pnpm 10+ (`pnpm --version`)
- PostgreSQL acessível (local, Docker, ou Supabase)
- Arquivo `.env` em `apps/api/` (copiar de `apps/api/.env.example`)

### Primeiros passos

```bash
# Instalar dependências
pnpm install

# Gerar cliente Prisma e aplicar migrations
cd apps/api
pnpm prisma generate
pnpm prisma migrate deploy

# Rodar seed (opcional — fixtures de desenvolvimento)
pnpm prisma db seed
```

### Desenvolvimento

```bash
# Da raiz do monorepo — inicia API (verifica se já está no ar antes de abrir nova instância)
pnpm start:dev

# Web em paralelo (terminal separado)
pnpm --filter @operaclinic/web dev

# Build de todos os pacotes
pnpm build

# Verificar saúde da API
pnpm api:ready:check                # informativo
pnpm api:ready:strict               # falha se status != ok
```

### Variáveis de ambiente mínimas (`apps/api/.env`)

```env
DATABASE_URL=postgresql://user:pass@localhost:5432/operaclinic
JWT_SECRET=<gere com: openssl rand -base64 48>
JWT_EXPIRY=15m
REFRESH_TOKEN_SECRET=<gere com: openssl rand -base64 48>
WEB_URL=http://localhost:3000
NODE_ENV=development
```

### URLs de produção (Render free-tier)

| Serviço | URL |
|---|---|
| API | `https://operaclinic-api.onrender.com` |
| Web | `https://operaclinic-web.onrender.com` |

> **Atenção cold-start:** instâncias free-tier dormem após 15 min de inatividade. Primeira requisição pode levar 30–60s.

---

## 5. Riscos Priorizados

### P0 — Bloqueadores para demo

| # | Risco | Evidência | Mitigação |
|---|---|---|---|
| R1 | **Cold-start de 30–60s** em produção (Render free-tier) | Serviços dormem após 15 min inatividade | Warm-up ping antes do demo; ou upgrade para instância paga |
| R2 | **`WEB_URL` não configurada no Render** (CORS bloqueado) | `main.ts:19` lê `WEB_URL` env; web em produção chama API de outro origin | Configurar `WEB_URL=https://operaclinic-web.onrender.com` no dashboard do Render |
| R3 | **Endpoints `/api/agent/v1` não existem** | `agent.controller.ts` expõe apenas `/api/v1/agent/captacao|agendamento/execute` com JWT | Implementar (Prompt 1) antes do demo |

### P1 — Riscos de integridade

| # | Risco | Evidência | Mitigação |
|---|---|---|---|
| R4 | **26 testes falhando** (skill-executor + agent-runtime legado) | `docs/CAPTACAO_AGENT_V1_COMPLETE.md` — 81/107 passando | Corrigir antes de expor agente ao público (Task 11 do backlog) |
| R5 | **`SlotHold` expirado sem GC** | Modelo tem `expiresAt` e status `EXPIRED` mas sem cron de limpeza confirmado | Confirmar se há job de expiração; senão implementar |
| R6 | **Timezone do caller vs. tenant** | `GET /reception/availability` recebe `date` em formato local; se caller estiver em UTC pode pegar dia errado | Documentar e enforçar formato `yyyy-MM-dd` na timezone do tenant |
| R7 | **Sem ambiente de staging** | Deploy vai direto para produção via `render.yaml` | Considerar branch de staging antes de ativar demo público |

### P2 — Débito técnico e observabilidade

| # | Risco | Evidência | Mitigação |
|---|---|---|---|
| R8 | **Agente declarado "PRODUÇÃO READY"** em doc desatualizado | `CAPTACAO_AGENT_V1_COMPLETE.md` — corrigido para "BETA" | Usar linguagem de beta em todos os materiais comerciais |
| R9 | **Sem persistência de observabilidade do agente** | `AgentExecution` registra execuções, mas métricas de P95/failure rate não são persistidas automaticamente | Implementar (Task 10 do backlog) antes de rollout além de 5% |
| R10 | **WhatsApp dedup não confirmado** | `messaging-webhook-abuse-protection.service.ts` existe, mas cobertura de dedup end-to-end não verificada | Testar cenário de mensagem duplicada (Task 9 do backlog) |
| R11 | **App mobile Flutter fora de escopo mas presente no repo** | `apps/professional-mobile/` tem código mas não está no CI nem no Render blueprint | Status de protótipo já documentado; não bloqueia, mas pode confundir novos contribuidores |

---

*Próximos passos do pacote de demo: **Prompt 1** — implementar endpoints `/api/agent/v1` (disponibilidade, criar, reagendar, cancelar, lookup) com autenticação por API Key para integração com o gateway WhatsApp.*
