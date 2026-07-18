# Auditoria de Gating de Planos (Fase 0)

Data: 2026-07-18
Escopo: preparação para a nova matriz comercial (WhatsApp/IA em todos os planos; diferenciação por volume e profundidade de gestão).

## 1. Onde `PLAN_FEATURES`/`getPlanFeatures` é consumido hoje

**Hipótese confirmada: é código morto.** `packages/shared/src/plan-features.ts` é re-exportado por `packages/shared/src/index.ts:8`, mas uma busca pelo repo inteiro por `PLAN_FEATURES`, `getPlanFeatures`, `PlanFeatureSet` e `CommercialPlanCode` não retorna nenhum uso fora do próprio arquivo — nem em `apps/api`, nem em `apps/web`. Não existe guard, interceptor ou decorator em `apps/api/src` que a consulte; `apps/api/src/common/guards/` existe como diretório mas está vazio. Os únicos guards reais são `AuthGuard` e `RoleGuard` (auth/role, não plano).

**Achado relevante — existe um segundo catálogo, esse sim vivo, que conflita com `plan-features.ts`:** `packages/shared/src/commercial.ts` define `COMMERCIAL_PUBLIC_PLAN_CODES` e `COMMERCIAL_PUBLIC_PLAN_CATALOG` (metadados de marketing: nome, preço, `publicMetadata.highlights[]` em texto livre). Esse catálogo é consumido de fato:
- `apps/api/src/modules/commercial/commercial.service.ts` — valida plano no onboarding e filtra planos públicos.
- `apps/api/src/modules/platform/plans.service.ts` — autopreenche nome/descrição/preço ao criar plano público; rejeita código fora do catálogo.
- `apps/web/components/public/commercial-checkout-workspace.tsx` e `public-content.ts` — página de checkout/comparação renderiza `highlights` (texto), não os booleans de `plan-features.ts`.

Ou seja: hoje há **duas fontes de verdade textuais/paralelas** sobre "o que cada plano inclui", nenhuma delas gating real. Decisão a tomar na Fase 1: `commercial.ts` (highlights de marketing) deve ser **derivado** da nova matriz tipada, não mantido em paralelo.

## 2. Modelagem de plano/assinatura e resolução por request

Prisma (`apps/api/prisma/schema.prisma`):
- `Tenant` (~L217-257): sem campo de plano/feature direto.
- `Plan` (~L319-335): `code`, `priceCents`, `currency`, `isPublic`, `isActive` — sem colunas de feature flag.
- `Subscription` (~L376-392): liga tenant↔plano, com `status` (`TRIAL/ACTIVE/PAST_DUE/CANCELED`) e `startsAt/endsAt`.
- `TenantFeature` (~L394-407): ver seção 3.
- `TenantSetting` (~L409-422): key/value genérico, não é feature gating.

**Não existe um serviço central** "plano vigente do tenant". O padrão (assinatura aberta = status em `[TRIAL, ACTIVE, PAST_DUE]`, mais recente, com `plan` incluído) está **duplicado manualmente 5 vezes** em `apps/api/src/modules/platform/tenants.service.ts`. `SubscriptionsService.getOpenStatuses()` só expõe a lista de status, não um helper "get current plan".

Ponto de atenção: `TenantsService.BASE_PLAN_CODE = "BASE_MVP"` é o plano padrão atribuído na criação do tenant — **não é** um dos `ESTETICA_*`. `getPlanFeatures("BASE_MVP")` hoje retorna `null`. A Fase 1/2 precisa decidir explicitamente o que `BASE_MVP` significa perante a nova matriz (mapear para START, ou tratar como "sem gating ainda"/trial).

**Contexto de tenant por request**: não existe `TenantGuard` nem `@CurrentTenant()` dedicados. `AuthGuard` popula `request.user` com `AuthenticatedUser` (`apps/api/src/auth/interfaces/authenticated-user.interface.ts`), que já carrega `tenantIds[]` e `activeTenantId`. `@CurrentUser()` expõe isso aos controllers e lança `UnauthorizedException` se ausente — para perfis `clinic`, `activeTenantId` está confiavelmente presente. Módulos individuais re-validam isso ad hoc via "access services" próprios (`MessagingAccessService.resolveActiveTenantId()`, `ClinicStructureAccessService.resolveActiveTenantId()`), lançando `ForbiddenException` caso contrário. Esse é o ponto natural de injeção de um futuro serviço/guard de entitlements — reutilizar esse padrão de resolução de tenant em vez de duplicá-lo de novo.

Autorização declarativa já existe hoje só para role: `RoleGuard` + `@Roles(...)` lendo metadata via `Reflector`. Um `@RequirePlanFeature(...)` + guard correspondente é o análogo natural.

## 3. `TenantFeature` / `tenant_features`

**Totalmente inerte.** Schema define `tenantId`, `key: String`, `enabled: Boolean @default(true)`, único em `(tenantId, key)`. Busca por `tenantFeature`/`TenantFeature` em `apps/api/src` não retorna nenhum uso em serviço ou controller — só a definição do schema e a migration de criação da tabela. `Tenant.tenantFeatures` (relação) nunca é percorrida.

Não há conflito ativo hoje (nada usa nenhum dos dois), mas são duas abordagens de modelagem diferentes para o mesmo problema futuro: `TenantFeature` é uma tabela de override por tenant (chave livre + boolean); `PLAN_FEATURES` é uma matriz estática por plano (sem override por tenant). **Decisão necessária na Fase 1/2**: usar `TenantFeature` — ou visão equivalente no módulo `platform` — como camada de override sobre os defaults derivados do plano (o próprio prompt do usuário já pede isso para founding customers), mantendo `shared` como default tipado. Recomenda-se reaproveitar `TenantFeature`/tabela de override em `platform` em vez de criar uma terceira estrutura.

## 4. Pontos de entrada que precisarão de gating

Todos os controllers abaixo já usam `@UseGuards(AuthGuard, RoleGuard)` + `@Roles(...)`; um guard de feature plugaria ao lado disso.

| Módulo | Controller | Handlers | Feature alvo |
|---|---|---|---|
| messaging | `message-templates.controller.ts` | `listTemplates`, `createTemplate` | messagingTemplates |
| messaging | `message-threads.controller.ts` | `listThreads`, `getThreadById`, `linkThreadPatient`, `resolveThread`, `sendMessage` | whatsappChannel |
| messaging | `handoffs.controller.ts` | `listHandoffs`, `openHandoff`, `closeHandoff`, `assignHandoff` | whatsappChannel |
| messaging | `integrations.controller.ts` | `listConnections`, `createConnection`, `completeEmbeddedSignup` | whatsappChannel |
| messaging | `whatsapp-webhooks.controller.ts` | — | público/inbound, **não gatear** |
| agent | `agent.controller.ts` | `executeCaptacao` | aiCaptacaoAgent |
| agent | `agent.controller.ts` | `executeAgendamento` | aiAgendamentoAgent |
| agent-api | `agent-api.controller.ts` (auth via `AgentKeyGuard`, não JWT) | `getAvailability`, `createAppointment`, `lookupAppointments`, `rescheduleAppointment`, `cancelAppointment` | aiAgendamentoAgent + contador de conversas — precisa resolver tenant a partir da API key, não de `@CurrentUser()` |
| follow-ups | `appointment-follow-ups.controller.ts` | `listDispatches`, `getStats`, `dispatchAppointmentReminder` | appointmentReminders |
| follow-ups | `appointment-follow-ups-cron.controller.ts` | trigger interno de cron | não gatear o endpoint; gatear o **disparo por tenant** dentro do job |
| clinic-insights | `clinic-insights.controller.ts` | `getExecutiveDashboard`, `getFinanceDashboard` | executiveDashboard |
| clinic-insights | `clinic-insights.controller.ts` | `getOperationalKpis` | operationalKpis |
| reports | `reports.controller.ts` | `exportAppointments`, `exportPatients` | operationalKpis/executiveDashboard |
| procedure-protocols | **ver alerta abaixo** | — | procedureProtocols |
| clinic-structure | `units.controller.ts` | `createUnit` | multiUnit / `limits.maxUnits` |
| clinic-structure | `professionals.controller.ts` | `createProfessional` | `limits.maxProfessionals` |
| scheduling | `appointments.controller.ts` | `createAppointment`, `rescheduleAppointment` (via `scheduleOverride: true` no payload) | scheduleOverride |
| scheduling | `waitlist.controller.ts` | `list`, `create`, `updateStatus`, `remove` | waitlist |

**Alerta — bug pré-existente, não relacionado a gating, mas que bloqueia gatear "procedureProtocols" corretamente:** existem **dois controllers distintos** registrados na mesma rota `@Controller("procedure-protocols")` simultaneamente — `apps/api/src/modules/procedure-protocols/procedure-protocols.controller.ts` (via `ProcedureProtocolsModule`) e `apps/api/src/modules/clinic-structure/procedure-protocols.controller.ts` (via `ClinicStructureModule`), ambos importados em `modules.module.ts`. Precisa ser deduplicado **antes** de aplicar o decorator de gating, senão uma cópia fica gateada e a outra não.

**Confirmado: limites quantitativos (`maxProfessionals`/`maxUnits`) não são aplicados em lugar nenhum hoje** — nenhuma checagem em `units.service.ts`/`professionals.service.ts`. Qualquer tenant, em qualquer plano, pode criar unidades/profissionais ilimitados atualmente.

**Confirmado: `scheduleOverride` já tem uma checagem hoje, mas é por ROLE, não por plano** — `appointments.service.ts` lança `ForbiddenException` se `scheduleOverride: true` e o ator não é `SCHEDULING_ADMIN_ROLES`. Um `CLINIC_MANAGER` em `ESTETICA_START` (que teria `scheduleOverride: false` na nova matriz de negócio) consegue usar isso hoje. A Fase 2 precisa somar a checagem de plano à checagem de role já existente, sem remover a de role.

## 5. Billing/Stripe vs. códigos de plano

`docs/STRIPE_SETUP.md` descreve o fluxo (interface `PaymentAdapter`, mock vs. Stripe) mas não mapeia plano→preço Stripe estático. O adapter real (`stripe-payment.adapter.ts`) cria a Checkout Session com **`price_data` inline**, gerado a partir da linha `Plan` no banco (`code`, `priceCents`, `currency`) — não há `price_xxx` fixo cadastrado no Stripe Dashboard. O `planCode` só entra no Stripe como metadata (`metadata: { planId, planCode }`) e no nome do produto (`OperaClinic ${plan.code}`).

O `subscriptionId` do Stripe é persistido em `CommercialOnboarding.paymentReference`, não em `Subscription` — cancelamento (`SubscriptionsService.cancelTenantSubscription()`) precisa fazer join de volta por `CommercialOnboarding` para achar a referência Stripe.

**O que precisa mudar quando a matriz mudar:**
1. `packages/shared/src/commercial.ts` (`COMMERCIAL_PUBLIC_PLAN_CODES`/`CATALOG`) — copy de marketing e preços, hoje é o gate real de "quais códigos de plano são válidos publicamente".
2. `apps/api/plans.json`/seed — linhas `Plan` no banco.
3. `packages/shared/src/plan-features.ts` — a matriz em si (hoje sem blast radius; passa a ser crítica assim que o enforcement existir).
4. **Nenhuma mudança manual no Stripe Dashboard é necessária** — preços são gerados dinamicamente via `price_data`.
5. Decidir o mapeamento de `BASE_PLAN_CODE = "BASE_MVP"` perante a nova matriz.

## Infraestrutura de apoio já existente

- `AuditService` (`apps/api/src/common/audit/audit.service.ts`), registrado em módulo `@Global()`, com `record({ action, actor, tenantId, targetType, targetId, metadata })` — pronto para logar eventos de gating (bloqueio de feature, limite atingido, override aplicado, mudança de plano) seguindo o padrão de constantes já usado em `audit.constants.ts`.
- Contexto de tenant confiável em toda request autenticada de perfil `clinic` via `AuthenticatedUser.activeTenantId` + `@CurrentUser()`, sem necessidade de novo mecanismo de auth.

## Conflito com `docs/decisions.md`

Nenhum conflito bloqueante encontrado. D-009 (billing separado da operação) é compatível com a exigência do prompt de não acoplar billing aos módulos operacionais — o gating consulta o plano vigente do tenant (via `platform`/`Subscription`), não o billing/Stripe diretamente. As Decisões D-001 a D-012 não mencionam a matriz comercial de features, portanto a mudança de posicionamento (WhatsApp/IA em todos os planos) não contradiz nenhuma decisão registrada — só precisa ser **adicionada** como nova decisão (D-013+) conforme a governança de mudança.

## Plano de execução proposto para as próximas fases

1. **Fase 1 (contrato)**: reescrever `plan-features.ts` com a nova matriz + `monthlyAiConversations`; decidir fusão com `commercial.ts` (recomendo: `commercial.ts` passa a derivar `highlights` a partir da matriz tipada, evitando as duas fontes de verdade); registrar D-013 (nova matriz), D-014 (definição de "1 conversa IA"), D-015 (regra de downgrade) em `docs/decisions.md`.
2. **Fase 2 (backend)**: criar `PlanEntitlementsService` em `platform` (resolve plano efetivo + overrides via `TenantFeature`/tabela própria), `@RequirePlanFeature()` + guard, contador mensal de conversas IA com handoff automático, enforcement de `maxProfessionals`/`maxUnits` na criação, resolver antes o bug de duplicidade de `procedure-protocols`, e somar checagem de plano ao `scheduleOverride` já existente por role.
3. **Fase 3 (frontend)**: upsell states no painel da clínica e no command center, barra de consumo de conversas IA.
4. **Fase 4**: testes, quality gate, atualização de docs.

Aguardando aprovação para iniciar a Fase 1.
