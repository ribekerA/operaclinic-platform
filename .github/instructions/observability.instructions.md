---
name: Observability - Structured Logging & Metrics
description: "Regras obrigatórias para observabilidade: logs estruturados, métricas por fluxo, alertas inteligentes, correlação tenant/thread/appointment, rastreabilidade completa."
paths: ["apps/api/src/common/**", "apps/api/src/**/*.service.ts", "docs/PRODUCTION_READINESS_RUNBOOK.md"]
---

# Observability Instructions — Structured Logging & Metrics

**Escopo**: Logging centralizado, métricas, alertas, dashboards, rastreabilidade  
**Objetivo**: Detectar e debugar problemas em produção em < 5min  
**Crítica**: Sem observabilidade = erro silencioso, cliente prejudicado, downtime oculto

---

## 1. Princípios de Estruturação

### 1.1 Structured Logging (JSON)

**Toda log entry é JSON com contexto**:

```json
{
  "timestamp": "2026-04-04T09:30:45.123Z",
  "level": "INFO" | "WARN" | "ERROR" | "DEBUG",
  "service": "scheduling",
  "module": "appointments",
  "tenantId": "clinic-abc",
  "userId": "user-123",
  "appointmentId": "appt-456",
  "action": "appointment.created",
  "status": "success",
  "metadata": {
    "duration_ms": 234,
    "patient_id": "patient-789",
    "professional_id": "prof-111",
    "slot": "2026-04-04T14:00:00Z"
  },
  "message": "Appointment created successfully",
  "traceId": "trace-xyz" // ✅ for correlation
}
```

### 1.2 Context Propagation

**Trace ID segue toda requisição**:
- Controller recebe HTTP request.
- Gera `traceId` = UUID.
- Passa para todo service, job, external call.
- Todas as logs incluem `traceId`.

```typescript
// app.interceptor.ts (NestJS)
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler) {
    const request = context.switchToHttp().getRequest();
    const traceId = request.headers["x-trace-id"] || uuidv4();

    request.traceId = traceId; // ✅ Attach to request

    return next.handle().pipe(
      tap(() => {
        this.logger.log({
          timestamp: new Date().toISOString(),
          traceId,
          method: request.method,
          url: request.url,
          status: 200, // ✅ will be updated by response interceptor
          duration_ms: Date.now() - request.startTime,
        });
      }),
      catchError((error) => {
        this.logger.error({
          timestamp: new Date().toISOString(),
          traceId,
          method: request.method,
          url: request.url,
          status: error.status || 500,
          error: error.message,
          stack: error.stack,
        });
        throw error;
      })
    );
  }
}
```

---

## 2. Operational Logging

### 2.1 Appointment Lifecycle

**Log entry for every status change**:

```
[INFO] appointment.status_changed
  tenantId: clinic-abc
  appointmentId: appt-456
  before_status: CREATED
  after_status: CONFIRMED
  actor: receptionist-123
  triggered_by: manual
  message_sent: true
  traceId: trace-xyz

[INFO] appointment.checked_in
  tenantId: clinic-abc
  appointmentId: appt-456
  checked_in_at: 2026-04-04T14:05:00Z
  delay_minutes: 5
  traceId: trace-xyz

[INFO] appointment.no_show
  tenantId: clinic-abc
  appointmentId: appt-456
  detected_at: 2026-04-04T14:20:00Z (15 min after scheduled)
  actor: system (automated)
  sent_recovery_offer: true
  traceId: trace-xyz
```

### 2.2 Message Threading

**Log entry for message intake and processing**:

```
[INFO] message.webhook_received
  tenantId: clinic-abc
  messageId: msg-789
  senderPhone: +5511987654321
  threadId: thread-xyz
  body_length: 85
  signature_valid: true
  traceId: trace-xyz

[INFO] message.thread_updated
  tenantId: clinic-abc
  threadId: thread-xyz
  messageId: msg-789
  intent: booking
  intent_confidence: 0.85
  handoff_needed: false
  next_action: reception_skill
  traceId: trace-xyz

[WARN] message.dedupe_triggered
  tenantId: clinic-abc
  messageId: msg-789
  retry_count: 2
  first_received: 2026-04-04T09:30:30Z
  traceId: trace-xyz
```

### 2.3 Handoff Decisioning

```
[INFO] handoff.decision
  tenantId: clinic-abc
  trigger: confidence_low
  confidence: 0.65
  threshold: 0.7
  threadId: thread-xyz
  recommended_actor: reception
  sla_minutes: 10
  traceId: trace-xyz

[INFO] handoff.escalated
  tenantId: clinic-abc
  handoffId: handoff-111
  routedTo: reception_queue
  at: 2026-04-04T09:35:00Z
  expectedPickupTime: 2026-04-04T09:40:00Z
  traceId: trace-xyz
```

### 2.4 Payment & Activation

```
[INFO] payment.confirmed
  tenantId: clinic-abc
  paymentReference: stripe-ch-123
  amount: 99.90
  currency: BRL
  status: PAID
  activated: true
  activatedAt: 2026-04-04T09:40:00Z
  traceId: trace-xyz

[ERROR] payment.webhook_mismatch
  tenantId: clinic-abc
  webhookStatus: paid
  backendStatus: pending
  recoveryAttempted: true
  reconciliationRequired: true
  traceId: trace-xyz
```

---

## 3. Metrics (Prometheus / CloudWatch)

### 3.1 Red Metrics (Failure Detection)

| Métrica | Type | Labels | Alert |
|---------|------|--------|-------|
| `appointments.created_total` | Counter | tenantId, clinic_id | none |
| `appointments.confirmed_total` | Counter | tenantId, clinic_id | none |
| `appointments.checkin_success_total` | Counter | tenantId, clinic_id | none |
| `appointments.checkin_error_total` | Counter | tenantId, error_code | > 0 in 5min |
| `appointments.conflicted_total` | Counter | tenantId | > 5% of books |
| `appointments.no_show_rate` | Gauge | tenantId | > 30% daily |
| `messages.webhook_error_total` | Counter | tenantId, error_type | > 0 in 5min |
| `messages.handoff_rate` | Gauge | tenantId | > 50% → investigate |
| `handoff.sla_breached_total` | Counter | tenantId, actor | > 0 → alert |
| `payment.webhook_mismatch_total` | Counter | tenantId | > 0 → critical |
| `payment.confirmed_total` | Counter | tenantId | none |
| `payment.failed_total` | Counter | tenantId | none |

### 3.2 Latency Metrics

| Métrica | Type | Labels | Alert |
|---------|------|--------|-------|
| `appointment.creation_time_ms` | Histogram | tenantId | p95 > 5s |
| `message.processing_time_ms` | Histogram | tenantId | p99 > 2s |
| `scheduling.availability_query_ms` | Histogram | tenantId | p99 > 1s |
| `handoff.decision_time_ms` | Histogram | tenantId | p99 > 500ms |
| `api.response_time_ms` | Histogram | endpoint, method | p95 > 2s |

### 3.3 Saturation Metrics

| Métrica | Type | Labels | Alert |
|--------|------|--------|-------|
| `active_threads` | Gauge | tenantId | > 100 |
| `message_queue_length` | Gauge | tenantId | > 500 |
| `database_connections` | Gauge | pool_name | > 80% |
| `memory_usage_percent` | Gauge | service | > 85% |

---

## 4. Implementation

### 4.1 Logger Service

```typescript
// common/logger/logger.service.ts
@Injectable()
export class LoggerService {
  private readonly loggerClient = createLoggerClient();

  log(payload: {
    level: "INFO" | "WARN" | "ERROR" | "DEBUG";
    service: string;
    module: string;
    tenantId: string;
    action: string;
    metadata?: Record<string, any>;
    message: string;
    traceId?: string;
    duration_ms?: number;
  }) {
    const entry = {
      timestamp: new Date().toISOString(),
      ...payload,
    };

    // Log to stdout (JSON)
    console.log(JSON.stringify(entry));

    // Send to centralized logging (ex.: DataDog, CloudWatch)
    this.loggerClient.send(entry);
  }
}

// ✅ Usage in service
constructor(private readonly logger: LoggerService, ...) {}

async createAppointment(dto: CreateAppointmentDto) {
  const traceId = this.request.traceId;

  try {
    const result = await this.appointments.create(dto);

    this.logger.log({
      level: "INFO",
      service: "scheduling",
      module: "appointments",
      tenantId: dto.tenantId,
      action: "appointment.created",
      message: "Appointment created successfully",
      metadata: {
        appointmentId: result.id,
        patientId: result.patientId,
        duration_ms: elapsed,
      },
      traceId,
    });

    return result;
  } catch (error) {
    this.logger.log({
      level: "ERROR",
      service: "scheduling",
      module: "appointments",
      tenantId: dto.tenantId,
      action: "appointment.creation_failed",
      message: `Failed to create appointment: ${error.message}`,
      metadata: {
        error: error.message,
        stack: error.stack,
      },
      traceId,
    });
    throw error;
  }
}
```

### 4.2 Metrics Service

```typescript
// common/metrics/metrics.service.ts
@Injectable()
export class MetricsService {
  private readonly appointmentCounter = new Counter({
    name: "appointments_created_total",
    help: "Total appointments created",
    labelNames: ["tenantId", "clinicId"],
  });

  private readonly appointmentLatency = new Histogram({
    name: "appointment_creation_time_ms",
    help: "Appointment creation latency",
    labelNames: ["tenantId"],
    buckets: [100, 200, 500, 1000, 2000, 5000],
  });

  recordAppointmentCreated(tenantId: string, clinicId: string) {
    this.appointmentCounter.inc({ tenantId, clinicId });
  }

  recordAppointmentLatency(tenantId: string, durationMs: number) {
    this.appointmentLatency.observe({ tenantId }, durationMs);
  }
}

// ✅ Usage
async createAppointment(dto: CreateAppointmentDto) {
  const start = Date.now();
  const result = await this.appointments.create(dto);
  const duration = Date.now() - start;

  this.metricsService.recordAppointmentCreated(
    dto.tenantId,
    dto.clinicId
  );
  this.metricsService.recordAppointmentLatency(
    dto.tenantId,
    duration
  );

  return result;
}
```

---

## 5. Alerting Rules

### 5.1 Critical Alerts (Immediate)

```
Alert: AppointmentCreationFailureRate
Condition: error_total / (success_total + error_total) > 0.05 over 5min
Action: Page on-call engineer
Severity: Critical

Alert: PaymentWebhookMismatch
Condition: payment.webhook_mismatch_total > 0 over 1min
Action: Page financial engineer + log to audit
Severity: Critical

Alert: MessageProcessingTimeout
Condition: message.processing_time_ms p99 > 5s over 10min
Action: Alert SRE
Severity: High
```

### 5.2 Warning Alerts (1-hour window)

```
Alert: NoShowRateHigh
Condition: appointments.no_show_rate > 0.30 daily
Action: Notify clinic manager
Severity: Medium

Alert: HandoffSLABreach
Condition: handoff.sla_breached_total > 0 over 1hour
Action: Alert support team
Severity: Medium
```

---

## 6. Dashboards

### 6.1 Operational Dashboard (Real-time)

```
┌────────────────────────────────┐
│ OperaClinic — Operational      │
│ Now: 09:35, Uptime: 99.98%     │
├────────────────────────────────┤
│ 📊 Appointments Today           │
│ • Created: 42                   │
│ • Confirmed: 38                 │
│ • Checked-in: 35                │
│ • No-show: 2                    │
│ • Pending confirmation: 4       │
├────────────────────────────────┤
│ 💬 Messages (last hour)         │
│ • Received: 156                 │
│ • Processed: 154                │
│ • Handoff: 31 (20%)             │
│ • Errors: 0                     │
├────────────────────────────────┤
│ ⚠️  Alerts (1h)                 │
│ • None                          │
├────────────────────────────────┤
│ 5min Latency (p95)              │
│ • Appointment creation: 245ms   │
│ • Message processing: 1.2s      │
│ • API response: 180ms           │
└────────────────────────────────┘
```

### 6.2 Troubleshooting Dashboard

**When debugging, show**:
- Request traceId all data.
- Timeline: every log entry with tenantId, actor, action.
- Errors: stack traces, error codes.
- Related threads/appointments/paymentReferences.

---

## 7. Testes Obrigatórios

### 7.1 Unit Tests

- [ ] Logger serializa JSON sem erro.
- [ ] TraceId propaga através de service chain.
- [ ] Metrics são registrados corretamente.
- [ ] Sem logs com tenantId faltando.
- [ ] Sem logs genéricos ("changed", "updated"); sempre específico.

### 7.2 Integration Tests

- [ ] E2E: request → log com traceId → métrica registrada.
- [ ] Error scenario: exception → log error + alert triggered.

---

## 8. Checklist Antes de Merge

- [ ] Log entries são JSON estruturado.
- [ ] Toda log inclui: timestamp, level, service, tenantId, action, message.
- [ ] TraceId propagado em toda requisição.
- [ ] Métricas registradas: appointments, messages, handoffs, errors.
- [ ] Nenhuma log genérica ("changed", "updated").
- [ ] Alertas configurados para falhas críticas.
- [ ] Dashboard acessível para operação 24/7.
- [ ] Testes cobrem logging + metrics.
- [ ] Documentação de logs + métricas atualizada.

---

## 9. Referências Rápidas

| Arquivo | Função |
|---------|--------|
| [common/logger/](apps/api/src/common/logger/) | Logger service |
| [common/metrics/](apps/api/src/common/metrics/) | Metrics service |
| [PRODUCTION_READINESS_RUNBOOK.md](docs/PRODUCTION_READINESS_RUNBOOK.md) | Runbook + alertas |

---

**Versão**: 1.0  
**Última atualização**: 2026-04-04  
**Mantido por**: Tech team OperaClinic
