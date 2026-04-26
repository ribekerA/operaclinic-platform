---
name: Reception - Operational Fluidity & State Management
description: "Regras obrigatórias para recepção: fluidez operacional, estados permitidos, redução de atrito, histórico auditável e experiência humana."
paths: ["apps/api/src/modules/reception/**", "apps/web/app/clinics/*/reception*", "apps/api/src/modules/messaging/handoff*"]
---

# Reception Instructions — Operational Fluidity & State Management

**Escopo**: [apps/api/src/modules/reception](apps/api/src/modules/reception) + recepção web UI  
**Objetivo**: Receptionist liga, atraz, confirma com mínimo clique; zero busca manual de contexto  
**Crítica**: Atrito em recepção = no-show, abandono, perda de receita

---

## 1. Princípios Operacionais

### 1.1 Fluidez = Contexto Sempre Pronto

**Receptionist nunca procura**:
- Nome do paciente = exibido
- Appointments futuros = listados
- Números de telefone = copiáveis com 1 tap
- Histórico de no-show = visível
- Últimas mensagens = contexto da conversa

**Backend fornece**:
- Dashboard "hoje": appointments do dia, check-in pendente, no-shows, cancelamentos.
- Contexto paciente: foto?, última visita, preferência de horário, histórico de no-show.
- Ações rápidas: confirmar, remarcar, cancelar, agendar novo.

### 1.2 Estados Simples & Sequencial

| Tela | Status | Contexto | Ações Disponíveis |
|------|--------|---------|------------------|
| **Dia** | Ver lista do dia | Appts hoje + no-show + cancelado | Abrir appt → detalhe |
| **Detalhe Appt** | CREATED / CONFIRMED / SCHEDULED | Paciente, horário, prof., histórico | Confirmar, remarcar, cancelar, check-in |
| **Confirmar** | Enviar SMS/WhatsApp | Msg pré-templates | Enviar, voltar |
| **Check-in** | Marcar presente | Validar hora, prof., paciente | Confirmar, voltar |
| **No-show** | Registrar ausência | Motivo (opt.), próximos slots | Registrar, ofertar reschedule |
| **Cancelamento** | Cancelar appt | Motivo, liberar slot | Confirmar, voltar |

**Bloqueador**: Telas com muitos campos = receptionist distrai, erra.

### 1.3 Auditoria Completa

**Toda ação em recepção deixa trilha**:
- `action`: created, confirmed, checked_in, cancelled, no_show, rescheduled
- `actor`: receptionist_id ou "system" se automated
- `timestamp`: quando
- `before`: estado anterior (ex.: CREATED)
- `after`: estado novo (ex.: CONFIRMED)
- `metadata`: telefone usado, retenativas, motivo de cancelamento

### 1.4 Histórico Paciente

**Reception deve ver**:
- Últimas 5 visitas: data, serviço, prof., presença (yes/no/no-show)
- No-show rate: ex.: "3 no-shows em 20 appts (15%)"
- Preferência: melhor horário, prof. preferido
- Observações: alergia, preferência de pagamento

---

## 2. Recepção Web (Frontend)

### 2.1 Dashboard Diário

**URL**: `/clinics/:clinicId/reception/`

```
┌─────────────────────────────────────────────┐
│ OperaClinic Recepção — Clínica ABC         │
│ Hoje, 04-04-2026 · 09:30 (Zona: SP)        │
├─────────────────────────────────────────────┤
│ 🔴 AÇÕES URGENTES (3)                       │
│ • Paciente XYZ sem confirmar (08:30)        │
│ • João sem check-in (09:00 passado)         │
│ • Maria pediu remarcar                      │
├─────────────────────────────────────────────┤
│ 📅 AGENDA HOJE                              │
│ 08:30 | João Silva     | Micropigm. | Prof. A | ✅ Confirmado
│ 09:00 | Maria Santos   | Limpeza    | Prof. B | ⏳ Aguardando
│ 09:30 | Paciente XYZ   | Botox      | Prof. A | ❌ Sem resposta (2 tentativas)
│ 10:00 | [LIVRE SLOT] NÃO OCUPADO     
│ ...
├─────────────────────────────────────────────┤
│ 📊 HOJE: 12 agendados, 9 confirmados, 2 no-show
│ 📌 Ocupação: 75%
└─────────────────────────────────────────────┘
```

**Componentes**:
- [ ] Urgent actions widget (top).
- [ ] Day agenda: scroll horizontal, drag-to-reschedule optional.
- [ ] Quick stats: confirmação %, ocupação, no-show count.
- [ ] Filter: status, prof., serviço.

### 2.2 Appointment Detail

**Ação**: Click no appointment → panel lateral

```
┌─────────────────────────┐
│ DETALHE AGENDAMENTO     │
├─────────────────────────┤
│ 📋 PACIENTE             │
│ • Nome: Maria Santos    │
│ • Tel: (11) 98765-4321  │
│ • CPF: XXX.XXX.XXX-XX   │
│ • Histórico:            │
│   - Última: 10 dias     │
│   - No-show: 1 em 15    │
│   - Preferência: 14h    │
├─────────────────────────┤
│ 📅 AGENDAMENTO          │
│ • Data/Hora: 04-04 14h  │
│ • Serviço: Micropigm.   │
│ • Profissional: Ana     │
│ • Status: CONFIRMADO ✅  │
│ • Confirmação: 01-04 18h│
├─────────────────────────┤
│ 💬 CONTEXTO             │
│ • Última msg: "OK, 14h" │
│ • Check-in: Pendente    │
├─────────────────────────┤
│ 🔧 AÇÕES RÁPIDAS        │
│ [✓ Check-in] [↻ Remarcar]
│ [✗ Cancelar] [📞 Ligar] 
│ [💬 WhatsApp]           │
└─────────────────────────┘
```

### 2.3 Ações Rápidas

#### Confirmar
- Pré: Status = CREATED.
- Ação: Click → backend transiciona para CONFIRMED + envia SMS/WhatsApp.
- Resposta: Toast "Confirmado!" ou erro se falha de integração.

#### Check-in
- Pré: Status = CONFIRMED, hora <= appointment time.
- Ação: Click → modal "Confirma check-in de Maria?" → Sim.
- Backend: transiciona para CHECKED_IN + log + métrica.
- Resposta: verde no appointment + move to "presentes".

#### Remarcar
- Pré: Status = CREATED ou CONFIRMED.
- Ação: Click → abre "Novo slot?" com disponibilidade.
- Fluxo: seleciona → backend valida → cancela antigo → cria novo → avisa paciente.
- SLA: < 3s.

#### Cancelar
- Pré: Status ≠ CHECKED_IN, ≠ COMPLETED.
- Ação: Click → modal "Motivo do cancelamento?" (opt.) → Cancelar.
- Backend: status = CANCELLED + audit + libera slot + avisa paciente.
- Observação: se já passou horário = "No-show" em vez de "Cancelado".

#### WhatsApp / Ligar
- Ação: Click → abre dialog com template pré-preenchido ou phone link.
- Template: "Olá Maria! Confirmamos sua micropigmentação em 04-04 às 14h. Pode vir?"
- Customização: (opcional) adicionar observação antes de enviar.

---

## 3. Backend Reception API

### 3.1 Endpoints Principais

```
GET /clinics/:clinicId/reception/day
  Query: { date: "2026-04-04" }
  Response: { appointments: [...], stats: { total, confirmed, no_show } }

GET /clinics/:clinicId/reception/appointment/:appointmentId
  Response: { appointment, patient, history, context }

POST /clinics/:clinicId/reception/appointment/:appointmentId/confirm
  Body: {}
  Response: { status: "CONFIRMED", notificationSent: true/false }

POST /clinics/:clinicId/reception/appointment/:appointmentId/check-in
  Body: { notes?: string }
  Response: { status: "CHECKED_IN", timestamp }

POST /clinics/:clinicId/reception/appointment/:appointmentId/cancel
  Body: { reason?: string }
  Response: { status: "CANCELLED", audit }

POST /clinics/:clinicId/reception/appointment/:appointmentId/no-show
  Body: { reason?: string }
  Response: { status: "NO_SHOW", audit }

POST /clinics/:clinicId/reception/appointment/:appointmentId/reschedule
  Body: { newSlot: { startTime, professionalId } }
  Response: { oldStatus: "CANCELLED", newAppointment }
```

### 3.2 Patient Context Enrichment

```typescript
// Reception response includes rich context
interface ReceptionAppointmentDetail {
  appointment: {
    id: string;
    status: string;
    startTime: DateTime;
    professional: { name, phone };
  };
  patient: {
    name: string;
    phone: string;
    lastVisit?: DateTime;
    noShowCount: number;
    noShowRate: number; // last 20 appts
    preferredTime?: string; // "morning" | "afternoon"
    preferredProfessional?: string;
  };
  confirmationStatus: {
    attemptCount: number;
    lastAttemptAt?: DateTime;
    method: "sms" | "whatsapp" | "none";
  };
  audit: [
    { timestamp, action, actor }
  ];
}
```

---

## 4. No-Show Workflow

### 4.1 Detecção Automática

- Backend: cron job que roda a cada 5 min.
- Busca: appointments com status CONFIRMED, horário < now - 15 min, sem check-in.
- Ação: transiciona para NO_SHOW, registra auditoria.
- Alert: receptionist recebe notificação "Maria virou no-show em 09:15".

### 4.2 Recuperação

**Se no-show detectado**:
1. Receptionist pode oferecer reschedule imediato (chamada/WhatsApp).
2. Template: "Vimos que você não pôde vir em 09:00. Quer remarcar para [slots alternativos]?"
3. Backend coleta resposta + reason (se informado) + registra padrão.

### 4.3 Métrica & Alerta

- Calcular no-show rate por clínica, por prof., por paciente.
- Se no-show rate > 20% para paciente → alertar receptionist "client is high risk".
- Se no-show rate > 30% para clínica → alertar clinic owner.

---

## 5. Integration com Messaging & Scheduling

### 5.1 Handoff from Messaging

**Quando messaging escalada**:
- Backend cria `handoff_request` com thread context.
- Reception UI mostra badge "🔔 Pendente" + detail do paciente + últimas mensagens.
- Receptionist pode: responder, agendar, escalar.

### 5.2 Confirmation Flow

**Após confirmar appointment**:
1. Backend chama `messaging.sendConfirmationMessage()`.
2. Se falha (WhatsApp down): dialogo "Falha ao enviar. Ligar manualmente?" + icon "📞".
3. Se sucesso: toast "Enviado para WhatsApp" + checkmark.

---

## 6. Testes Obrigatórios

### 6.1 Unit Tests

- [ ] Day dashboard: retorna appointments + stats corretos.
- [ ] Confirm: transiciona CREATED → CONFIRMED + audit logged.
- [ ] Check-in: só permitido se status CONFIRMED + hora atual >= appointment time.
- [ ] Cancel: só permitido se status ≠ CHECKED_IN, ≠ COMPLETED.
- [ ] Reschedule: cancela antigo, cria novo, avisa paciente.
- [ ] No-show detection: cron marca como NO_SHOW corretamente.
- [ ] Tenant isolation: receptionist clinic A não vê clinic B.

### 6.2 Integration Tests

- [ ] E2E: create appt → dashboard mostra → confirm → check-in.
- [ ] Concurrency: 2 receptionist mesmo appt → 1 confirma, 2 vê "already confirmed".

### 6.3 Production Smoke

```bash
pnpm smoke:e2e
# Smoke includes: reception create → confirm → check-in
```

---

## 7. Observabilidade

| Métrica | Lugar |
|---------|-------|
| `reception.confirmation_rate` | % appts confirmados até 24h antes |
| `reception.checkin_rate` | % appts com check-in |
| `reception.no_show_rate` | % appts no-show |
| `reception.average_confirmation_time` | tempo entre create e confirm |
| `reception.reschedule_count` | reschedules por clínica/dia |

---

## 8. Checklist Antes de Merge

- [ ] Dashboard exibe contexto completo (paciente, histórico, ações).
- [ ] Ações rápidas (confirm, check-in, cancel, reschedule) < 1s de latência.
- [ ] Status transitions são rígidos; estado inválido = erro explícito.
- [ ] Audit log registrado: `tenantId`, `actorId`, `appointmentId`, `action`, `before`, `after`.
- [ ] Tenant isolation testado: clinic A não vê clinic B.
- [ ] No-show detection automático + alerta ao receptionist.
- [ ] Testes cobrem happy path + error cases.
- [ ] UI é simples, sem busca manual; contexto sempre pronto.
- [ ] Documentação atualizada.

---

## 9. Referências Rápidas

| Arquivo | Função |
|---------|--------|
| [apps/api/src/modules/reception](apps/api/src/modules/reception) | Backend receptión API |
| [apps/web/app/clinics/*/reception](apps/web/app/clinics/*/reception) | Reception UI |
| [appointments.service.ts](apps/api/src/modules/scheduling/appointments.service.ts) | Status transitions |
| [messaging/handoff*](apps/api/src/modules/messaging/handoff-requests.service.ts) | Handoff integration |

---

**Versão**: 1.0  
**Última atualização**: 2026-04-04  
**Mantido por**: Tech team OperaClinic
