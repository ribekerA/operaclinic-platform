---
name: Scheduling - Backend Authority & Concurrency
description: "Regras obrigatórias para o módulo de scheduling: autoridade do backend, idempotência, hold válido, lifecycle rígido, timezone, concorrência e conflito de slots."
paths: ["apps/api/src/modules/scheduling/**", "apps/web/app/**/scheduling*", "packages/shared/**/scheduling*"]
---

# Scheduling Instructions — Backend Authority & Concurrency

**Escopo**: [apps/api/src/modules/scheduling](apps/api/src/modules/scheduling) + frontend intake  
**Autoridade Absoluta**: Backend é dono de disponibilidade, hold, conflito e lifecycle  
**Crítica**: Qualquer mudança aqui afeta recepção, WhatsApp e redução de no-show

---

## 1. Princípios Não-Negociáveis

### 1.1 Backend Authority (Absoluto)

- **Frontend/Agent NUNCA**:
  - Confirma slot como disponível sem backend validar no momento.
  - Cria hold sem chamar `scheduling.hold()`.
  - Muda status de appointment sem transação backend.
  - Inventa disponibilidade; sempre busca do backend.

- **Backend SEMPRE**:
  - Valida disponibilidade no momento do booking (não hours antes).
  - Detecta conflito com `scheduling-concurrency.service.ts`.
  - Escreve hold com `tenantId` + `appointmentId` + `professional` + `timestamp`.
  - Rejeita operação se há conflito; nunca sobrescreve.

**Referência**: [apps/api/src/modules/scheduling/scheduling-concurrency.service.ts](apps/api/src/modules/scheduling/scheduling-concurrency.service.ts)

### 1.2 Idempotência & Transação

**Toda operação crítica**:
- Use `Prisma.$transaction()` ou DB begin/commit.
- Inclua `idempotencyKey` ou similar no DTO para retry seguro.
- Repetir request com mesmo input = mesmo resultado, sem duplicação de hold/appointment.

**Exemplo esperado**:
```typescript
async createAppointment(dto: CreateAppointmentDto) {
  return await this.prisma.$transaction(async (tx) => {
    // 1. Validar disponibilidade
    const slot = await this.validateSlotAvailable(tx, dto);
    if (!slot) throw new ConflictException("Slot occupied");

    // 2. Criar hold se necessário
    if (dto.holdDurationMinutes > 0) {
      await this.createHold(tx, { ...dto, expiresAt: future });
    }

    // 3. Criar appointment
    const appointment = await tx.appointment.create({
      data: {
        ...dto,
        tenantId: payload.tenantId, // ✅ Sempre
        status: AppointmentStatus.CREATED,
      },
    });

    // 4. Audit
    await this.auditService.log(tx, {
      tenantId: payload.tenantId,
      action: "appointment.created",
      targetId: appointment.id,
    });

    return appointment;
  });
}
```

### 1.3 Hold Válido

**Hold é temporary reservation sem commitment**:
- Cria hold com `expiresAt` fixo (ex.: 15 min).
- Hold expirado é limpado automaticamente (garbage collection ou query filter).
- Hold pode ser cancelado pelo paciente durante validade.
- Backend rejeita appointment creation se hold expirado ou não existe.

**Regra**: Se há hold ativo, nenhum outro appointment pode ocupar aquele slot no período.

### 1.4 Lifecycle Rígido

| Status | Précondicão | Transição Permitida | Ator | Auditável |
|--------|--------|--------|--------|-----------|
| `CREATED` | Booking bem-sucedido | → `CONFIRMED` | Backend | ✅ |
| `CONFIRMED` | Status = CREATED + validação | → `CHECKED_IN`, `CANCELLED` | Reception ou Backend | ✅ |
| `CHECKED_IN` | Status = CONFIRMED + dia/hora atual | → `COMPLETED`, `NO_SHOW` | Reception | ✅ |
| `COMPLETED` | Status = CHECKED_IN | (final) | - | ✅ |
| `CANCELLED` | Status ≠ COMPLETED, ≠ CHECKED_IN | (final) | Reception, Paciente | ✅ |
| `NO_SHOW` | Status = CONFIRMED + past hora sem check-in | (final) | Automated ou Reception | ✅ |

**Bloqueadores**:
- ❌ Não pular etapas (ex.: CREATED → CHECKED_IN direto).
- ❌ Não reabrir COMPLETED ou NO_SHOW.
- ❌ Não cancelar CHECKED_IN.
- ❌ Não mudar status sem `tenantId` validado.

---

## 2. Timezone & Horários

### 2.1 Storage e Normalization

- **BD armazena tudo em UTC** (Prisma `DateTime`).
- **Clinics têm timezone**: armazenar em `clinic.timezone` (ex.: "America/Sao_Paulo").
- **Conversão happens on boundary** (controller/gateway), nunca no service.

**Referência**: [apps/api/src/modules/scheduling/scheduling-timezone.service.ts](apps/api/src/modules/scheduling/scheduling-timezone.service.ts)

### 2.2 Availabilidade

- Backend calcula `availableSlots` em timezone local da clínica.
- Frontend recebe slots em UTC (já convertidos).
- Ao criar appointment, frontend envia hora em UTC; backend valida respeitando timezone.

**Bloqueador**: Confundir UTC com timezone local = agendamento em horário errado.

---

## 3. Concorrência & Conflito

### 3.1 Detecção de Conflito

**Conflito = dois appointments no mesmo slot para o mesmo professional**.

Implementação:
- Usar `scheduling-concurrency.service.ts` para CHECK antes de criar/atualizar.
- Se conflito detectado, retornar `ConflictException` com lista de slots disponíveis alternativos.
- Nunca "ignorar" conflito e criar duplicate.

### 3.2 Retry & Backoff

- Frontend pode retry se receber 409 Conflict.
- Backoff: 100ms → 200ms → 400ms (máx 3 retry).
- Não retry infinito; após 3x, escalar para recepção.

### 3.3 Race Condition

**Cenário**: Dois clientes tentam agendar mesmo slot simultaneamente.

- DB constraint (UNIQUE em professional + date + startTime + tenantId) rejeita segundo.
- Backend captura `UniqueConstraintViolation` e retorna 409.
- Frontend oferece slots alternativos imediatamente.

---

## 4. Operações Críticas

### 4.1 CreateAppointment

- **Pré**: Hold criado (opcional) e validado.
- **Ação**: Transação atômica com validação de slot.
- **Pós**: Appointment criado, audit logged, callback ao messaging (se configurado).
- **Rollback**: Se falha qualquer etapa, revert hold e abort.

### 4.2 RescheduleAppointment

- **Pré**: Appointment existe, é CONFIRMED, novo slot disponível.
- **Ação**: Criar hold → cancelar antigo → criar novo → atualizar audit.
- **Bloqueador**: Não pode remarcar se já CHECKED_IN.
- **SLA**: Remarcação deve processar < 2s.

### 4.3 CancelAppointment

- **Pré**: Appointment é CREATED ou CONFIRMED.
- **Ação**: Marcar como CANCELLED, liberar hold, enviar notification (WhatsApp se ativo).
- **Regra de negócio**: "Cancellable até 24h antes" = backend valida timestamp.

### 4.4 CheckIn / NoShow

- **Pré**: Appointment é CONFIRMED + hoje é data do appointment + hora atual ≤ tempo do appointment.
- **Ação**: Transição de status (CONFIRMED → CHECKED_IN ou NO_SHOW).
- **Auditoria**: Log inclui quando, quem, operação.
- **Métrica**: Registrar check-in time para ocupação dashboard.

---

## 5. Validação & Constraints

### 5.1 DTO Validation

```typescript
// apps/api/src/modules/scheduling/dto/create-appointment.dto.ts
export class CreateAppointmentDto {
  @IsUUID()
  tenantId: string; // ✅ REQUIRED

  @IsUUID()
  professionalId: string;

  @IsISO8601()
  startTime: string; // ✅ ISO format (UTC)

  @Min(15)
  @Max(480)
  durationMinutes: number; // 15min to 480min

  @IsOptional()
  @Min(10)
  @Max(60)
  holdDurationMinutesIfCreed: number; // optional hold
}
```

### 5.2 Database Constraints

```sql
-- ✅ UNIQUE constraint prevents double-booking
UNIQUE (tenant_id, professional_id, start_time, status)
WHERE status != 'cancelled'; -- cancelled slots are free

-- ✅ FK integrity
FOREIGN KEY (professional_id) REFERENCES professionals(id);
FOREIGN KEY (clinic_id) REFERENCES clinics(id);
FOREIGN KEY (patient_id) REFERENCES patients(id);
```

---

## 6. Testes Obrigatórios

### 6.1 Unit Tests

- [ ] Valid slot → create succeeds + hold created + audit logged.
- [ ] Conflicting slot → error 409 + alternative slots returned.
- [ ] Invalid tenant → error 403.
- [ ] Expired hold → error 400 "hold expired".
- [ ] Reschedule valid → old cancelled + new created + audit.
- [ ] Cancel past appointment → error "cannot cancel past appointment".
- [ ] Check-in future time → error "cannot check-in before appointment time".

### 6.2 Integration Tests

- [ ] E2E: create → hold → check-in sequence.
- [ ] Concurrency: 2 parallel requests same slot → 1 succeeds, 1 fails with 409.
- [ ] Timezone: create in São Paulo timezone → verify storage in UTC.
- [ ] Idempotency: retry same request → same result, no duplicate.

### 6.3 Production Smoke

```bash
# Pre-deploy checklist
pnpm --filter @operaclinic/api test -- scheduling
# Smoke E2E must include: create + hold + check-in
pnpm smoke:e2e
```

---

## 7. Checklist Antes de Merge

- [ ] Backend valida `tenantId` em TODA query/mutação de scheduling.
- [ ] Conflito de slot é detectado e retornado antes de criar.
- [ ] Hold é criado com `expiresAt` válido.
- [ ] Lifecycle status é rígido; transição não permitida = erro explícito.
- [ ] Timezone é normalizado em UTC na BD.
- [ ] Transação é atômica; nenhum half-done.
- [ ] Audit log registrado com `tenantId`, `actorId`, `appointmentId`, `action`, `timestamp`.
- [ ] Testes cobrem conflito, idempotência, timezone, lifecycle.
- [ ] Documentação atualizada se regra mudou.

---

## 8. Referências Rápidas

| Arquivo | Função |
|---------|--------|
| [appointments.service.ts](apps/api/src/modules/scheduling/appointments.service.ts) | CRUD appointment + lifecycle |
| [scheduling-concurrency.service.ts](apps/api/src/modules/scheduling/scheduling-concurrency.service.ts) | Detecção conflito |
| [scheduling-timezone.service.ts](apps/api/src/modules/scheduling/scheduling-timezone.service.ts) | Conversão timezone |
| [scheduling-policies.service.ts](apps/api/src/modules/scheduling/scheduling-policies.service.ts) | Validação rule (ex.: deadline) |
| [appointments.controller.ts](apps/api/src/modules/scheduling/appointments.controller.ts) | Endpoints HTTP |

---

**Versão**: 1.0  
**Última atualização**: 2026-04-04  
**Mantido por**: Tech team OperaClinic
