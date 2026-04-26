---
name: Commercial - Webhook Reliability & Ativation Integrity
description: "Regras obrigatórias para onboarding comercial: webhook confiável, reconciliação, ativação controlada, nunca assumir pagamento ou ativação sem confirmação real."
paths: ["apps/api/src/modules/commercial/**", "apps/api/src/modules/platform/**", "apps/web/app/platform/**"]
---

# Commercial Instructions — Webhook Reliability & Activation Integrity

**Escopo**: [apps/api/src/modules/commercial](apps/api/src/modules/commercial) + onboarding flow  
**Autoridade Absoluta**: Backend é dono de payment state, activation status, reconciliation  
**Crítica**: Erro de pagamento ou ativação = cliente perdido, receita perdida

---

## 1. Princípios Não-Negociáveis

### 1.1 Nunca Assumir Confirmação Sem Fato Real

**Hierarquia de Confiança** (do mais confiável ao menos):

1. **Backend transactional state** (ex.: `CommercialOnboardingStatus.PAID`)
   - Fonte: Prisma transaction com confirmação de payment adapter.
   - Confiança: 100%.
   - Exemplo: "Stripe webhook validado + assinatura + backend UPDATE sucesso".

2. **Webhook reconciliado** (ex.: webhook recebido + assinatura validada + backend conciliado)
   - Fonte: Webhook driver (ex.: Stripe) + validação de signature + mapping para backend state.
   - Confiança: 95% (webhook pode atrasar ou duplicar).
   - Ação: Aguardar webhook + verificar estado no adapter.

3. **Webhook SÓ recebido** (sem reconciliação)
   - Fonte: Backend recebeu POST HTTP mas não processou ou falhou.
   - Confiança: 60% (webhook pode ser falso, duplicado, atrasado).
   - Ação: NÃO fazer mutação crítica; registrar como pendente; alertar.

4. **Relato manual / UI indication sem validação**
   - Fonte: "Usuário disse que pagou" ou "Link de checkout aberto".
   - Confiança: 10%.
   - Ação: NÃO fazer NADA; sempre exigir nível 1 ou 2.

**Regra**: Se nível de confiança < 80%, dizer "pendente de confirmação" + nuca fazer ativação.

### 1.2 Isolamento e Tenant Context

- **Toda operação comercial** (lead, onboarding, payment) escreve `tenantId`.
- **Lookup por publicToken** valida tenant ownership antes de processar.
- **Webhook DEVE validar tenantId** antes de atualizar status.
- **Query SEMPRE filtra por tenantId**.

**Referência**: [apps/api/src/modules/commercial/commercial.service.ts](apps/api/src/modules/commercial/commercial.service.ts)

### 1.3 Ativação = Todos os Marcos Completos

**Ativação incompleta ≠ ativação**:
- Tenant criado? ✅
- Clinic criado? ✅
- Admin user criado? ✅
- Subscription criado? ✅
- All 4 passed? → `ONBOARDING_COMPLETED`.
- Falta 1? → `ONBOARDING_STARTED` (not complete).

**Bloqueador**: "Clínica está quase ativa" = ainda não é ativa. Nunca prometer ativação parcial.

---

## 2. Payment State Machine

### 2.1 Estados Definidos

```
INITIATED
  ↓ (checkout criado)
AWAITING_PAYMENT
  ↓ (webhook pagamento confirmado)
PAID
  ↓ (onboarding iniciado)
ONBOARDING_STARTED
  ↓ (all activated)
ONBOARDING_COMPLETED (final)

AWAITING_PAYMENT → PAYMENT_FAILED (webhook notificou)
AWAITING_PAYMENT → PAYMENT_CANCELLED (user aborted)
```

### 2.2 Transição Segura

**Toda transição de estado**:
- Usa `Prisma.$transaction()` ← múltiplas tabelas, all-or-nothing.
- Valida pré-condição (ex.: "pode passar AWAITING_PAYMENT → PAID apenas se webhook válido").
- Registra auditoria com `beforeStatus`, `afterStatus`, `trigger`.
- Nenhuma transição "mágica"; cada uma exigida explicitamente.

```typescript
async confirmCheckout(publicToken: string, sessionId?: string) {
  return await this.prisma.$transaction(async (tx) => {
    // 1. Lookup
    const onboarding = await tx.commercialOnboarding.findUniqueOrThrow({
      where: { publicToken },
    });
    if (onboarding.status !== "AWAITING_PAYMENT") {
      throw new Error("Invalid state for payment confirmation");
    }

    // 2. Valida webhook
    const confirmation = await this.paymentAdapter.confirmPayment(sessionId);
    if (!confirmation.verified) {
      throw new Error("Payment verification failed");
    }

    // 3. Update status
    const updated = await tx.commercialOnboarding.update({
      where: { id: onboarding.id },
      data: {
        status: "PAID",
        paymentReference: confirmation.reference,
        paidAt: new Date(),
      },
    });

    // 4. Audit
    await this.auditService.log(tx, {
      tenantId: onboarding.tenantId,
      action: "payment.confirmed",
      metadata: { reference: confirmation.reference },
    });

    return updated;
  });
}
```

---

## 3. Webhook Processing

### 3.1 Signature Validation

**Todo webhook WhatsApp, Stripe, etc. tem assinatura**:
- Backend recebe: `X-Signature: sha256=...`.
- Valida com `PAYMENT_WEBHOOK_SECRET`.
- Se inválido: retorna `401 Unauthorized`, não processa, logs.
- Sem validação = risco de falsificação de página.

### 3.2 Deduplication

**Webhook pode ser enviado múltiplas vezes** (retry do provider):
- Use `idempotencyKey` ou `webhookEventId` como chave dedupe.
- Se ID já processado: retorna `ACK 200` sem reprocessar.
- Dedupe table: `{ webhookEventId, processedAt, result }`.

### 3.3 Webhook Processing Flow

```
1. Recebe payload
2. Valida signature
3. Extract event ID + tenant ID (if applicable)
4. Check dedupe
   IF exists with status=success → return cached result
   IF exists with status=processing → return "still processing, retry later"
5. Parse data
6. Lookup onboarding by reference or ID
7. Validate tenant isolation
8. Determine action (payment_success, payment_failed, etc.)
9. Execute transaction (state update + audit + notifications)
10. Mark dedupe as processed
11. Return 200 OK
```

### 3.4 Failure Handling

**Se webhook falha**:
- Retry: webhook provider retenta automaticamente (standard practice).
- Backend timeout: retorna 503 "service unavailable"; provider retries.
- Backend error: retorna 400 "invalid data" se payload é invaluable; provider does NOT retry.
- Critical error (tx falha): LOG + ALERT + manual reconciliation.

---

## 4. Activation Flow

### 4.1 Trigger

**Quando**: Status transiciona de PAID → ONBOARDING_STARTED.

**O que**:
```typescript
async initiateOnboarding(onboarding) {
  return await this.prisma.$transaction(async (tx) => {
    // 1. Create tenant
    const tenant = await tx.tenant.create({
      data: {
        name: onboarding.companyName,
        ownerEmail: onboarding.contactEmail,
      },
    });

    // 2. Create clinic
    const clinic = await tx.clinic.create({
      data: {
        name: onboarding.clinicName,
        tenantId: tenant.id,
        timezone: onboarding.timezone || "America/Sao_Paulo",
      },
    });

    // 3. Create admin user
    const adminUser = await tx.user.create({
      data: {
        email: onboarding.contactEmail,
        name: onboarding.contactName,
        role: RoleCode.TENANT_ADMIN,
        tenantId: tenant.id,
        clinicId: clinic.id,
        passwordHash: await hash(temporaryPassword), // send in email later
      },
    });

    // 4. Create subscription
    const subscription = await tx.subscription.create({
      data: {
        tenantId: tenant.id,
        plan: onboarding.plan,
        status: "active",
        startedAt: new Date(),
      },
    });

    // 5. Update onboarding
    await tx.commercialOnboarding.update({
      where: { id: onboarding.id },
      data: {
        status: "ONBOARDING_STARTED",
        tenantId: tenant.id,
        activatedAt: new Date(),
      },
    });

    // 6. Audit
    await this.auditService.log(tx, {
      tenantId: tenant.id,
      action: "onboarding.initiated",
      metadata: { clinic: clinic.id },
    });

    return { tenant, clinic, adminUser };
  });
}
```

### 4.2 Completion

**Quando**: Todos os 4 marcos completados + validation passou.

**Validação**:
- Tenant exists + not archived ✅
- Clinic exists + timezone defined ✅
- Admin user has password set ✅
- Subscription active ✅

**Se todos**: Status → `ONBOARDING_COMPLETED`.
**Se falta**: Permanecer em `ONBOARDING_STARTED` + alert ao support.

### 4.3 Notification ao Lead

```
Email para onboarding.contactEmail:

Assunto: Sua clínica está pronta para começar!

Olá [Name],

Sua clínica [Clinic Name] foi ativada com sucesso.

Acesse agora: https://app.operaclinic.com/clinics/[clinicId]/dashboard
Email: [email]
Senha temporária: [temp]. Altere seu password no login.

Próximas etapas:
1. Complete profile da clínica
2. Crie agenda de profissionais
3. Configure WhatsApp (opcional)

Suporte: support@operaclinic.com

—OperaClinic Team
```

---

## 5. Data Consistency & Reconciliation

### 5.1 Reconciliation Workflow

**Cenário**: Frontend vê "Pagamento pendente" mas backend vê "PAID".
- Causa: webhook chegou tarde, frontend ainda não sincronizou.
- Solução: Frontend refaz GET `/onboarding/{publicToken}` a cada 5s até consistência.

### 5.2 Audit Trail

Everything logged:
- `tenantId`, `onboardingId`
- `action`: payment_confirmed, activation_initiated, activation_completed
- `timestamp`
- `actor`: system / webhook
- `metadata`: payment_reference, reason, error

### 5.3 Manual Override

**Se lead relata divergência** (ex: "Paguei ontem, ainda pendente"):
1. Support verifica payment adapter (Stripe dashboard).
2. Se confirmado em adapter mas backend ainda vê AWAITING_PAYMENT → manual reconciliation.
3. Support chamar `forceConfirmPayment()` com evidence + reason.
4. Transição estado + audit log com "manual_override_reason".
5. LOG + ALERT para finance team.

---

## 6. Testes Obrigatórios

### 6.1 Unit Tests

- [ ] State machine: transições válidas são permitidas, inválidas são rejeitadas.
- [ ] Webhook signature: inválido retorna 401.
- [ ] Webhook dedup: mesmo evento 2x, processado 1x.
- [ ] Tenant isolation: lead A não vê lead B.
- [ ] Activation: após PAID, status transiciona para ONBOARDING_STARTED.
- [ ] Activation validation: se falta admin user, gera erro antes de completion.

### 6.2 Integration Tests

- [ ] E2E: checkout → webhook → PAID → ONBOARDING_STARTED → ONBOARDING_COMPLETED.
- [ ] Webhook delay: webhook chega 30s depois de HTTP request → eventual consistency OK.
- [ ] Concurrent webhooks: 2 webhooks simultâneos mesmo lead → 1 processa, 1 dedup.

### 6.3 Production Smoke

```bash
# Smoke deve incluir onboarding flow real (sem payment, com mock adapter)
pnpm smoke:e2e
```

---

## 7. Observabilidade Mínima

| Métrica | Lugar |
|---------|-------|
| `commercial.onboarding.initiated_total` | Counter (per day) |
| `commercial.onboarding.completed_total` | Counter (per day) |
| `commercial.payment.confirmed_total` | Counter (per day) |
| `commercial.payment.failed_total` | Counter (per day) |
| `commercial.activation_time_minutes` | Histogram (PAID → COMPLETED) |
| `commercial.webhook_dedupe_ratio` | Ratio duplicate / total |
| `commercial.reconciliation_mismatch` | Counter (alert if > 0) |

---

## 8. Checklist Antes de Merge

- [ ] Webhook signature validado; sem validação = rejeitar.
- [ ] Deduplicação por event ID testada.
- [ ] State machine transitions são rígidos e bloqueados.
- [ ] Tenant isolation em toda operação comercial.
- [ ] Ativação só permitida se TODOS os marcos completados.
- [ ] Transação atômica: estado + audit + notifications ou nada.
- [ ] Audit log registrado: `tenantId`, `action`, `beforeStatus`, `afterStatus`, `timestamp`.
- [ ] Testes cobrem happy path, webhook delay, concurrent webhooks.
- [ ] Reconciliation workflow documentado.
- [ ] Manual override exigir evidência + alert.
- [ ] Documentação atualizada se regra mudou.

---

## 9. Referências Rápidas

| Arquivo | Função |
|---------|--------|
| [commercial.service.ts](apps/api/src/modules/commercial/commercial.service.ts) | Payment state + activation |
| [payment-adapter.factory.ts](apps/api/src/modules/commercial/adapters/payment-adapter.factory.ts) | Payment adapter factory |
| [commercial.controller.ts](apps/api/src/modules/commercial/commercial.controller.ts) | HTTP endpoints |
| [onboarding entity](apps/api/src/modules/commercial) | CommercialOnboarding schema |

---

**Versão**: 1.0  
**Última atualização**: 2026-04-04  
**Mantido por**: Tech team OperaClinic
