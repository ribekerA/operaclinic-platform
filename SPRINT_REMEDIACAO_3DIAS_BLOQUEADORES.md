# 📅 SPRINT GO/NO-GO ACELERADO — Remediação 3 Bloqueadores

**Duração**: 3 semanas (1 semana bloqueadores críticos)  
**Objetivo**: Tornar seguro escalar agents & measurement de ROI  
**Status**: Ready to start

---

## ⏱️ SEMANA 1 — BLOQUEADORES (4 Tarefas Críticas)

### 📌 Tarefa 1.1: Webhook Deduplication (Commercial)
**Prioridade**: 🔴 CRÍTICA  
**Owner**: Backend (1 dev)  
**Estimativa**: 2 dias

**O Quê:**
Implementar idempotencyKey pattern em `confirmCheckout()` para evitar duplicação de tenant

**Checklist:**
- [ ] 1.1.1: Create schema migration: `payment_idempotency` table
  ```sql
  CREATE TABLE payment_idempotency (
    id UUID PRIMARY KEY,
    public_token VARCHAR NOT NULL,
    idempotency_key VARCHAR NOT NULL UNIQUE,
    checkpoint VARCHAR, -- "INITIATED" | "PAYMENT_CONFIRMED" | "COMPLETED"
    result_json JSONB, -- cached result
    created_at TIMESTAMP DEFAULT now()
  );
  ```
  **File to create**: `apps/api/src/modules/commercial/schema/idempotency.migration.sql`
  **Estimate**: 2h

- [ ] 1.1.2: Update `CommercialService.confirmCheckout()`
  ```typescript
  async confirmCheckout(dto: ConfirmCheckoutDto) {
    // Check if already processed
    const existing = await this.idempotencyRepo.findOne({
      where: { idempotency_key: dto.idempotencyKey, public_token: dto.publicToken }
    });
    if (existing?.checkpoint === 'COMPLETED') {
      return existing.result_json; // cached
    }
    
    // Process... (existing logic)
    
    // Save idempotency record
    await this.idempotencyRepo.create({...});
  }
  ```
  **File to update**: [commercial.service.ts](apps/api/src/modules/commercial/commercial.service.ts)
  **Estimate**: 3h

- [ ] 1.1.3: Write unit test (happy path + duplicate path)
  ```typescript
  it('should return cached result on idempotency key duplicate', async () => {
    const dto = { publicToken: 'xxx', idempotencyKey: 'key123' };
    const result1 = await service.confirmCheckout(dto);
    const result2 = await service.confirmCheckout(dto); // same key
    expect(result1).toEqual(result2);
    expect(result1.tenantId).toEqual(result2.tenantId); // SAME tenant
  });
  ```
  **File**: `commercial.service.spec.ts`
  **Estimate**: 2h

- [ ] 1.1.4: E2E test (webhook + retry scenario)
  ```typescript
  it('should handle webhook duplicate gracefully', async () => {
    const payload = { ... };
    const res1 = await webhookHandler(payload);
    const res2 = await webhookHandler(payload); // retry
    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
    expect(res1.tenantId).toEqual(res2.tenantId);
  });
  ```
  **File**: `commercial.e2e.spec.ts`
  **Estimate**: 2h

**Validation:**
- ✅ Run `npm run test -- commercial.service`
- ✅ Run `npm run test:e2e -- commercial.webhook`
- ✅ Verify in DB: 1 transaction per webhook (no duplicate CommercialOnboarding)

**Done When:**
- Tests pass
- Deployed to staging
- Manual test: send webhook 2x → 1 tenant created

---

### 📌 Tarefa 1.2: Webhook Deduplication (Messaging)
**Prioridade**: 🔴 CRÍTICA  
**Owner**: Backend (1 dev)  
**Estimativa**: 1-2 dias

**O Quê:**
Implementar messageId deduplication em `handleInboundWebhook()` para evitar thread duplicado

**Checklist:**
- [ ] 1.2.1: Create schema migration: `webhook_message_dedup` table
  ```sql
  CREATE TABLE webhook_message_dedup (
    id UUID PRIMARY KEY,
    message_id VARCHAR NOT NULL,
    tenant_id UUID NOT NULL,
    integration_id VARCHAR NOT NULL,
    first_seen_at TIMESTAMP DEFAULT now(),
    processed_at TIMESTAMP,
    result_json JSONB -- cached thread response
  );
  CREATE UNIQUE INDEX ON webhook_message_dedup(message_id, tenant_id, integration_id);
  ```
  **File**: `apps/api/src/modules/messaging/schema/dedup.migration.sql`
  **Estimate**: 1h

- [ ] 1.2.2: Update `WhatsappWebhooksService.handleInboundWebhook()`
  ```typescript
  async handleInboundWebhook(dto: WhatsappWebhookDto) {
    // Check if messageId already seen
    const existing = await this.dedupRepo.findOne({
      where: { 
        message_id: dto.messageId, 
        tenant_id: dto.tenantId 
      }
    });
    if (existing?.processed_at) {
      return existing.result_json; // return cached, skip processing
    }
    
    // Process... (existing logic)
    
    // Save dedup record
    await this.dedupRepo.update(
      { message_id: dto.messageId },
      { processed_at: new Date(), result_json: result }
    );
  }
  ```
  **File**: [whatsapp-webhooks.service.ts](apps/api/src/modules/messaging/whatsapp-webhooks.service.ts)
  **Estimate**: 2h

- [ ] 1.2.3: Write unit test (dedup scenario)
  ```typescript
  it('should skip processing duplicate messageId', async () => {
    const webhook = { messageId: 'msg123', tenantId: 'tenant-a' };
    const result1 = await service.handleInboundWebhook(webhook);
    const result2 = await service.handleInboundWebhook(webhook); // dup
    expect(result1).toEqual(result2);
    // verify only 1 MessageThread created
    const threads = await threadRepo.find({});
    expect(threads).toHaveLength(1);
  });
  ```
  **Estimate**: 2h

- [ ] 1.2.4: E2E test (webhook 2x rapid)
  ```typescript
  it('should handle webhook duplicate in 30s', async () => {
    const webhook = { ... };
    const [res1, res2] = await Promise.all([
      webhookHandler(webhook),
      delay(100).then(() => webhookHandler(webhook))
    ]);
    expect(res1.threadId).toEqual(res2.threadId); // SAME thread
  });
  ```
  **Estimate**: 1h

**Validation:**
- ✅ `npm run test -- messaging.service`
- ✅ `npm run test:e2e -- messaging.webhook`
- ✅ Manual test: send same messageId 3x → 1 thread

**Done When:**
- Tests pass
- 1 thread per messageId confirmed
- No agent duplicate executions

---

### 📌 Tarefa 1.3: Structured JSON Logging + Trace ID
**Prioridade**: 🔴 CRÍTICA  
**Owner**: Backend (1 dev)  
**Estimativa**: 3 dias

**O Quê:**
Implement structured JSON logging com traceId propagation across HTTP requests

**Checklist:**
- [ ] 1.3.1: Create `LoggingInterceptor` (inject traceId)
  ```typescript
  @Injectable()
  export class LoggingInterceptor implements NestInterceptor {
    intercept(context: ExecutionContext, next: CallHandler) {
      const req = context.switchToHttp().getRequest();
      const traceId = req.headers['x-trace-id'] || generateUUID();
      req.traceId = traceId;
      
      return next.handle().pipe(
        tap((res) => console.log(`[${traceId}] Success`)),
        catchError((err) => {
          console.log(`[${traceId}] Error: ${err.message}`);
          throw err;
        })
      );
    }
  }
  ```
  **File**: `apps/api/src/common/logging/logging.interceptor.ts`
  **Estimate**: 1h

- [ ] 1.3.2: Create `StructuredLogger` service (JSON output)
  ```typescript
  @Injectable()
  export class StructuredLogger {
    log(data: {
      level: 'info' | 'warn' | 'error';
      action: string;
      tenantId: string;
      traceId: string;
      metadata?: any;
    }) {
      console.log(JSON.stringify({
        timestamp: new Date().toISOString(),
        ...data
      }));
    }
  }
  ```
  **File**: `apps/api/src/common/logging/structured-logger.service.ts`
  **Estimate**: 1.5h

- [ ] 1.3.3: Migrate existing Logger calls in critical services
  Services to update:
  - `scheduling/appointments.service.ts`
  - `reception/reception.service.ts`
  - `messaging/whatsapp-webhooks.service.ts`
  - `commercial/commercial.service.ts`
  
  Example:
  ```typescript
  // OLD
  this.logger.log(`Appointment ${apptId} created`);
  
  // NEW
  this.structuredLogger.log({
    level: 'info',
    action: 'appointment.created',
    tenantId: context.tenantId,
    traceId: context.traceId,
    metadata: { appointmentId: apptId, profesionalId: profId }
  });
  ```
  **Estimate**: 4h

- [ ] 1.3.4: Unit test (verify JSON structure)
  ```typescript
  it('should output valid JSON with traceId', async () => {
    const logSpy = spyOn(console, 'log');
    const logger = new StructuredLogger();
    logger.log({ ... });
    const output = JSON.parse(logSpy.calls.argsFor(0)[0]);
    expect(output.traceId).toBeDefined();
    expect(output.timestamp).toBeDefined();
  });
  ```
  **Estimate**: 1h

**Validation:**
- ✅ Run an HTTP request, verify log has traceId
- ✅ Parse log output as JSON (no parse errors)
- ✅ All critical services outputting JSON

**Done When:**
- ✅ Logs are valid JSON
- ✅ traceId propagates across services
- ✅ Can grep logs by traceId

---

### 📌 Tarefa 1.4: Red Metrics + No-Show Automation
**Prioridade**: 🔴 CRÍTICA  
**Owner**: Backend (1 dev)  
**Estimativa**: 2-3 dias

**O Quê:**
Implement Prometheus metrics (RED) + no-show cron job

**Checklist:**
- [ ] 1.4.1: Install Prometheus dependency
  ```bash
  npm install @prometheus/client
  ```
  **Estimate**: 0.5h

- [ ] 1.4.2: Create `MetricsService`
  ```typescript
  @Injectable()
  export class MetricsService {
    private appointmentsCreated = new Counter({
      name: 'appointments_created_total',
      help: 'Total appointments created',
      labelNames: ['tenantId', 'outcome'] // outcome: success | error
    });
    
    private noShowRate = new Gauge({
      name: 'no_show_rate',
      help: 'No-show rate percentage',
      labelNames: ['tenantId']
    });
    
    recordAppointmentCreated(tenantId: string, outcome: 'success' | 'error') {
      this.appointmentsCreated.labels(tenantId, outcome).inc();
    }
    
    setNoShowRate(tenantId: string, rate: number) {
      this.noShowRate.labels(tenantId).set(rate);
    }
  }
  ```
  **File**: `apps/api/src/common/metrics/metrics.service.ts`
  **Estimate**: 2h

- [ ] 1.4.3: Create metrics endpoint (`/metrics`)
  ```typescript
  @Get('/metrics')
  async metrics() {
    return register.metrics();
  }
  ```
  **File**: `apps/api/src/health/health.controller.ts`
  **Estimate**: 0.5h

- [ ] 1.4.4: Create no-show automation scheduler
  ```typescript
  @Injectable()
  export class NoShowScheduler {
    @Cron('0 6 * * *') // 6 AM every day
    async markNoShowAppointments() {
      const clinics = await clinicRepo.find();
      for (const clinic of clinics) {
        const now = new Date();
        const noShowAppts = await appointmentRepo.find({
          where: {
            tenantId: clinic.tenantId,
            status: In(['BOOKED', 'CONFIRMED']),
            appointment_time: LessThan(new Date(now.getTime() - 15 * 60000))
          }
        });
        
        for (const appt of noShowAppts) {
          appt.status = 'NO_SHOW';
          await appointmentRepo.save(appt);
          await auditService.log({
            action: 'appointment.no_show_auto',
            tenantId: clinic.tenantId,
            metadata: { appointmentId: appt.id, reason: 'AUTOMATIC' }
          });
        }
        
        // Update gauge
        const rate = noShowAppts.length / (total appts today);
        metricsService.setNoShowRate(clinic.tenantId, rate);
      }
    }
  }
  ```
  **File**: `apps/api/src/modules/scheduling/scheduled-jobs/no-show.scheduler.ts`
  **Estimate**: 2h

- [ ] 1.4.5: Unit tests
  ```typescript
  it('should mark appointments as NO_SHOW if > 15min past', async () => {
    const appt = await appointmentRepo.create({ /* 30 min ago */ });
    await scheduler.markNoShowAppointments();
    const updated = await appointmentRepo.findOne(appt.id);
    expect(updated.status).toBe('NO_SHOW');
  });
  ```
  **Estimate**: 1h

**Validation:**
- ✅ Run `curl http://localhost:3000/metrics` → Prometheus format
- ✅ Run scheduler manually → no-shows marked
- ✅ Manual test: create appt 30min ago → should be NO_SHOW at 6 AM job

**Done When:**
- ✅ Metrics endpoint responsive
- ✅ No-shows auto-marked
- ✅ Metrics include tenantId labels

---

## 🎯 SEMANA 1 — VALIDATION GATES

### Gate 1: Deduplication Confidence
**Before proceeding to Semana 2:**
- [ ] Commercial webhook tested 2x same payload → 1 tenant
- [ ] Messaging webhook tested 3x same messageId → 1 thread
- [ ] No secondary effects (e.g., audit logs duplicated)

### Gate 2: Observability Baseline
**Before anything else:**
- [ ] Metrics endpoint `/metrics` returns Prometheus format
- [ ] no_show_rate tracked per clinic
- [ ] appointment_created_total tracked
- [ ] **Baseline metrics recorded**:
  - Current no-show rate: X%
  - Current confirmation rate: Y%
  - Current message processing latency: Z ms

### Gate 3: Code Quality
- [ ] All tests pass: `npm run test -- --testPathPattern="(commercial|messaging|metrics)"`
- [ ] E2E tests pass: `npm run test:e2e`
- [ ] Linting pass: `npm run lint`

---

## 📊 SEMANA 2 — OPERACIONAL

### 📌 Tarefa 2.1: SLA Enforcement (Reception)
**Prioridade**: 🟡 ALTA  
**Owner**: Backend  
**Estimativa**: 2 dias

**O Quê:**
Implementar reminder + alert se appointment não confirmado 24h antes

**Checklist:**
- [ ] 2.1.1: Scheduler para enviar reminder mensagens
  - 24h before appt: enviar SMS/WhatsApp "Confirme sua consulta"
  - If status ainda BOOKED after reminder: alert para receptionist
  - **Estimate**: 2h

- [ ] 2.1.2: Métrica: confirmation_rate_24h
  - Daily: count CONFIRMED appts com appointment_time < now + 24h
  - Alert if rate < 70% (target: 85%)
  - **Estimate**: 1h

- [ ] 2.1.3: Reception UI: highlight overdue confirmations
  - Widget: "Pendentes Confirmação: 3 (overdue)"
  - **Estimate**: 1 dia (frontend)

**Done When:**
- ✅ Reminders sent 24h before
- ✅ Confirmation rate tracked
- ✅ Alert triggered if < 70%

---

### 📌 Tarefa 2.2: Payment Reconciliation + Alerts
**Prioridade**: 🟡 ALTA  
**Owner**: Backend  
**Estimativa**: 2 dias

**O Quê:**
Detectar divergência entre webhook payment status e backend status; alertar

**Checklist:**
- [ ] 2.2.1: Create reconciliation scheduler
  - Job hourly: SELECT * FROM CommercialOnboarding WHERE webhook_status != backend_status
  - Alert: slack/email to finance team
  - **Estimate**: 2h

- [ ] 2.2.2: Metric: payment_webhook_mismatch_total
  - **Estimate**: 0.5h

- [ ] 2.2.3: Manual recovery workflow
  - Allow admin to "retry payment confirmation" with audit trail
  - **Estimate**: 1h

**Done When:**
- ✅ Divergence detected within 1h
- ✅ Alert sent

---

### 📌 Tarefa 2.3: Intent Classification Improvement
**Prioridade**: 🟡 ALTA  
**Owner**: Backend + Agent  
**Estimativa**: 3 dias

**O Quê:**
Melhorar triagem automática de mensagens (booking vs cancel vs urgency vs escalate)

**Checklist:**
- [ ] 2.3.1: Implement regex-based classifier
  - Booking: "quero agendar", "agend", "horário", "data"
  - Cancellation: "cancel", "rescind", "não vou"
  - Urgency: "urgente", "dor", "emergência", "help"
  - Escalate: confidence < 70% OR key phrases like "change clinic" or "billing"
  - **Estimate**: 1h

- [ ] 2.3.2: Integrate with agent skill (or improve agent logic)
  - If classified as BOOKING → call scheduling skill
  - If CANCEL → show cancellation options
  - If URGENCY → handoff HIGH priority
  - If ESCALATE → handoff MEDIUM priority
  - **Estimate**: 2h (dep on agent readiness)

- [ ] 2.3.3: Metric: intent_classification_accuracy
  - Day: log true_intent vs predicted_intent
  - Manual sampling (10x/day agent tests)
  - **Estimate**: 1h

**Done When:**
- ✅ Handoff rate stable or -5% (with good classification)
- ✅ Classification accuracy > 80% (manual spot check)

---

## 📊 SEMANA 3 — OBSERVABILITY

### 📌 Tarefa 3.1: Observability Dashboard (Grafana)
**Prioridade**: 🟡 MÉDIA  
**Owner**: DevOps/Backend  
**Estimativa**: 3 dias

**O Quê:**
Create Grafana dashboard con KPIs críticos

**Checklist:**
- [ ] 3.1.1: Docker Compose para Prometheus + Grafana (local dev)
- [ ] 3.1.2: Dashboard panels:
  - Gauge: appointments today, confirmed (%), no-show (%)
  - Chart: messages/hour, handoff_rate/hour
  - Time series: confirmation_rate (7 days)
  - Alerts: red if webhook error > 0, yellow if handoff > 10%
- [ ] 3.1.3: Configure alert rules (AlertManager)

**Done When:**
- ✅ Dashboard loads
- ✅ Metrics populate
- ✅ Ready for production monitoring

---

### 📌 Tarefa 3.2: Hold Garbage Collection
**Prioridade**: 🟢 BUM

---

## 📈 SUCCESS METRICS

### Baseline (Week 0 — NOW)
Record today's state:
```
☐ no_show_rate: ___% (e.g., 15%)
☐ confirmation_rate_24h: ___% (e.g., 70%)
☐ reception_response_time: ___ min (e.g., 45 min)
☐ messages.processing_latency: ___ ms (e.g., 2500 ms)
☐ handoff_rate: ___% (e.g., 12%)
☐ payment_webhook_mismatch_rate: ___% (e.g., 0.3%)
☐ appointments_created_per_day_avg: ___ (e.g., 42)
```

### Target (Week 4)
```
✓ no_show_rate: -15% (e.g., 15% → 12.75%)
✓ confirmation_rate_24h: +10% (e.g., 70% → 77%)
✓ reception_response_time: -20% (e.g., 45 → 36 min)
✓ messages.processing_latency: < 1500 ms (e.g., 2500 → 1200)
✓ handoff_rate: stable or -5% (e.g., 12% → 11.4%)
✓ payment_webhook_mismatch_rate: 0% (detected + resolved)
✓ webhook_error_rate: 0% in SLA (< 1h downtime)
```

---

## 🚨 ROLLBACK PLAN

If any blocker breaks:

1. **Commercial dedup fails**:
   - Rollback: Remove idempotencyKey check, accept duplicate tenants
   - Alert: manual daily audit for duplicate tenants
   - ETA fix: 2h

2. **Messaging dedup fails**:
   - Rollback: Revert to without dedup, accept duplicate threads
   - Mitigation: manual dedup script daily
   - ETA fix: 2h

3. **Observability metrics spam/errors**:
   - Rollback: disable metrics collection
   - Impact: no ROI measurement
   - ETA fix: 1h

**Approval Gate**: If rollback, STOP and get CTO approval before resuming.

---

## 📋 ACCEPTANCE CRITERIA

### Semana 1 — All 4 tasks DONE
- ✅ Deduplication working (commercial + messaging)
- ✅ Structured logging JSON output verified
- ✅ No-show automation running
- ✅ Metrics endpoint responsive
- ✅ Baseline metrics recorded
- ✅ Tests pass
- ✅ E2E smoke tests pass

### Semana 2 — All 3 tasks DONE
- ✅ SLA enforcement + alerts
- ✅ Payment reconciliation
- ✅ Intent classification > 80%

### Semana 3 — Readiness for Agent Scaling
- ✅ Dashboard live
- ✅ ROI measurement operational
- ✅ Handoff SLA enforced
- ✅ No-show tracking systematic
- ✅ CTO approval to scale agents

---

**Status**: Ready to Start
**Next**: Get approval + assign owners

