# Agent API — Documentação

**Prefixo:** `/api/agent/v1`  
**Autenticação:** Header `X-Agent-Key: <chave>` (segredo em variável de ambiente)  
**Escopo:** A chave dá acesso apenas à clínica associada a `AGENT_API_TENANT_ID`. Nenhuma outra clínica é acessível.  
**Rate limit:** 30 req/min por IP (configuração do throttler global da API).  
**Formato de erro:** `{ "error_code": "CODIGO", "message": "...", "details"?: ... }`

---

## Variáveis de ambiente necessárias

```env
# Gere com: openssl rand -base64 32
AGENT_API_KEY=minha-chave-secreta

# UUID do tenant da clínica associada a este agente
AGENT_API_TENANT_ID=uuid-do-tenant
```

---

## Endpoint 1 — Consultar disponibilidade

```
GET /api/agent/v1/availability
```

**Query parameters:**

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `service_id` | UUID | Sim | ID do tipo de consulta/serviço (`ConsultationType.id`) |
| `date_from` | string | Sim | Data inicial no formato `YYYY-MM-DD` |
| `date_to` | string | Sim | Data final no formato `YYYY-MM-DD` (máx 14 dias de range) |
| `professional_id` | UUID | Não | Filtrar por profissional específico. Se omitido, retorna todos os profissionais ativos |

**Exemplo de request:**

```
GET /api/agent/v1/availability?service_id=svc-uuid&date_from=2026-07-10&date_to=2026-07-12
X-Agent-Key: minha-chave-secreta
```

**Exemplo de response (200):**

```json
[
  {
    "date": "2026-07-10",
    "professional_id": "prof-uuid-1",
    "professional_name": "Dra. Ana Lima",
    "service_id": "svc-uuid",
    "service_name": "Avaliação Estética",
    "duration_minutes": 30,
    "starts_at": "2026-07-10T13:00:00.000Z",
    "ends_at": "2026-07-10T13:30:00.000Z"
  },
  {
    "date": "2026-07-10",
    "professional_id": "prof-uuid-1",
    "professional_name": "Dra. Ana Lima",
    "service_id": "svc-uuid",
    "service_name": "Avaliação Estética",
    "duration_minutes": 30,
    "starts_at": "2026-07-10T14:00:00.000Z",
    "ends_at": "2026-07-10T14:30:00.000Z"
  }
]
```

**Erros possíveis:**

| Código | HTTP | Descrição |
|---|---|---|
| `SERVICE_NOT_FOUND` | 404 | `service_id` não existe ou está inativo nesta clínica |
| `PROFESSIONAL_NOT_FOUND` | 404 | `professional_id` não existe ou está inativo |
| `INVALID_DATE_RANGE` | 400 | `date_to` < `date_from`, ou range > 14 dias |

> **Nota:** Horários no passado nunca são retornados. O endpoint considera ocupações existentes, bloqueios de agenda e intervalos entre consultas.

---

## Endpoint 2 — Criar agendamento

```
POST /api/agent/v1/appointments
Content-Type: application/json
```

**Body:**

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `professional_id` | UUID | Sim | ID do profissional |
| `service_id` | UUID | Sim | ID do tipo de consulta (`ConsultationType.id`) |
| `starts_at` | ISO 8601 | Sim | Data/hora de início (ex: `2026-07-10T14:00:00-03:00`) |
| `patient_name` | string | Sim | Nome completo do paciente (2–120 chars) |
| `patient_phone` | string | Sim | Telefone em E.164 (ex: `+5511999998888`) |
| `unit_id` | UUID | Não | ID da unidade. Se omitido, usa a unidade padrão do profissional |
| `notes` | string | Não | Observações (máx 500 chars) |

O paciente é criado automaticamente se o telefone ainda não estiver cadastrado na clínica. Se já existir, o agendamento é vinculado ao paciente existente.

**Idempotência:** Chamadas com o mesmo `patient_phone` + `starts_at` retornam o mesmo agendamento (não criam duplicatas).

**Exemplo de request:**

```json
{
  "professional_id": "prof-uuid-1",
  "service_id": "svc-uuid",
  "starts_at": "2026-07-10T14:00:00-03:00",
  "patient_name": "Maria da Silva",
  "patient_phone": "+5511999998888"
}
```

**Exemplo de response (201):**

```json
{
  "id": "appt-uuid-1234",
  "confirmation_code": "A1B2C3",
  "professional_id": "prof-uuid-1",
  "professional_name": "Dra. Ana Lima",
  "service_id": "svc-uuid",
  "service_name": "Avaliação Estética",
  "starts_at": "2026-07-10T17:00:00.000Z",
  "ends_at": "2026-07-10T17:30:00.000Z",
  "duration_minutes": 30,
  "status": "BOOKED",
  "unit_id": null,
  "unit_name": null,
  "patient_name": "Maria da Silva",
  "patient_phone": "+5511999998888"
}
```

**Erros possíveis:**

| Código | HTTP | Descrição |
|---|---|---|
| `SLOT_TAKEN` | 409 | Horário já ocupado. Mensagem inclui instrução de re-consultar `/availability` |
| `SLOT_NOT_FOUND` | 400 | Horário inválido (passado, fora da grade do profissional) |
| `VALIDATION_ERROR` | 400 | Campo obrigatório faltando ou formato inválido |

---

## Endpoint 3 — Remarcar agendamento

```
PATCH /api/agent/v1/appointments/:id/reschedule
Content-Type: application/json
```

**Path param:** `:id` — UUID do agendamento

**Body:**

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `starts_at` | ISO 8601 | Sim | Novo horário de início |
| `reason` | string | Não | Motivo da remarcação (máx 255 chars) |

**Exemplo de request:**

```json
{
  "starts_at": "2026-07-11T15:00:00-03:00",
  "reason": "Paciente solicitou mudança de horário"
}
```

**Exemplo de response (200):**

```json
{
  "id": "appt-uuid-1234",
  "confirmation_code": "A1B2C3",
  "professional_id": "prof-uuid-1",
  "professional_name": "Dra. Ana Lima",
  "service_id": "svc-uuid",
  "service_name": "Avaliação Estética",
  "starts_at": "2026-07-11T18:00:00.000Z",
  "ends_at": "2026-07-11T18:30:00.000Z",
  "duration_minutes": 30,
  "status": "BOOKED",
  "unit_id": null,
  "unit_name": null
}
```

**Erros possíveis:**

| Código | HTTP | Descrição |
|---|---|---|
| `APPOINTMENT_NOT_FOUND` | 404 | Agendamento não existe nesta clínica |
| `SLOT_TAKEN` | 409 | Novo horário já ocupado |
| `APPOINTMENT_NOT_RESCHEDULABLE` | 400 | Status atual não permite remarcação (ex: CANCELED, COMPLETED) |

---

## Endpoint 4 — Cancelar agendamento

```
POST /api/agent/v1/appointments/:id/cancel
Content-Type: application/json
```

**Path param:** `:id` — UUID do agendamento

**Body:**

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `reason` | string | Não | Motivo do cancelamento (máx 255 chars). Default: "Cancelado pelo paciente via assistente virtual." |

**Exemplo de request:**

```json
{
  "reason": "Paciente não pode comparecer"
}
```

**Exemplo de response (200):**

```json
{
  "id": "appt-uuid-1234",
  "confirmation_code": "A1B2C3",
  "professional_id": "prof-uuid-1",
  "professional_name": "Dra. Ana Lima",
  "service_id": "svc-uuid",
  "service_name": "Avaliação Estética",
  "starts_at": "2026-07-10T17:00:00.000Z",
  "ends_at": "2026-07-10T17:30:00.000Z",
  "duration_minutes": 30,
  "status": "CANCELED",
  "unit_id": null,
  "unit_name": null
}
```

**Erros possíveis:**

| Código | HTTP | Descrição |
|---|---|---|
| `APPOINTMENT_NOT_FOUND` | 404 | Agendamento não existe nesta clínica |
| `APPOINTMENT_NOT_CANCELLABLE` | 400 | Status atual não permite cancelamento |

---

## Endpoint 5 — Buscar agendamentos por telefone

```
GET /api/agent/v1/appointments/lookup
```

**Query parameters:**

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `phone` | string | Sim | Telefone em E.164 (ex: `+5511999998888`) |

Retorna até 10 agendamentos futuros ativos (BOOKED, CONFIRMED, CHECKED_IN, etc.) ordenados por data, vinculados ao paciente com aquele telefone na clínica.

**Exemplo de request:**

```
GET /api/agent/v1/appointments/lookup?phone=%2B5511999998888
X-Agent-Key: minha-chave-secreta
```

**Exemplo de response (200):**

```json
[
  {
    "id": "appt-uuid-1234",
    "confirmation_code": "A1B2C3",
    "professional_id": "prof-uuid-1",
    "professional_name": "Dra. Ana Lima",
    "service_id": "svc-uuid",
    "service_name": "Avaliação Estética",
    "starts_at": "2026-07-10T17:00:00.000Z",
    "ends_at": "2026-07-10T17:30:00.000Z",
    "duration_minutes": 30,
    "status": "BOOKED",
    "unit_id": null,
    "unit_name": null
  }
]
```

Retorna array vazio `[]` se o telefone não tiver agendamentos futuros.

---

## Autenticação — detalhes

```
X-Agent-Key: <AGENT_API_KEY>
```

| Cenário | Código | HTTP |
|---|---|---|
| Header ausente ou valor errado | `UNAUTHORIZED` | 401 |
| `AGENT_API_KEY` não configurada no servidor | `UNAUTHORIZED` | 503 |

---

## Códigos de erro completos

| `error_code` | HTTP padrão | Descrição |
|---|---|---|
| `UNAUTHORIZED` | 401/503 | Chave inválida, ausente, ou API não configurada |
| `SLOT_TAKEN` | 409 | Horário ocupado (criação ou remarcação) |
| `SLOT_NOT_FOUND` | 400 | Horário inválido ou no passado |
| `APPOINTMENT_NOT_FOUND` | 404 | Agendamento não encontrado nesta clínica |
| `APPOINTMENT_NOT_CANCELLABLE` | 400 | Status não permite cancelamento |
| `APPOINTMENT_NOT_RESCHEDULABLE` | 400 | Status não permite remarcação |
| `SERVICE_NOT_FOUND` | 404 | `service_id` inválido ou inativo |
| `PROFESSIONAL_NOT_FOUND` | 404 | `professional_id` inválido ou inativo |
| `INVALID_DATE_RANGE` | 400 | Range de datas inválido |
| `VALIDATION_ERROR` | 400 | Campo faltando ou formato incorreto |
| `INTERNAL_ERROR` | 500 | Erro inesperado |

---

## Exemplo de conversa agente → API

```
Paciente: "quero marcar uma avaliação estética para sexta"

1. Agente consulta disponibilidade:
   GET /api/agent/v1/availability?service_id=svc-est&date_from=2026-07-10&date_to=2026-07-10
   → retorna 3 slots

2. Agente oferece ao paciente os horários disponíveis

3. Paciente escolhe: "pode ser 14h"

4. Agente confirma: "Posso confirmar: Avaliação Estética com Dra. Ana na sexta às 14h. Confirma?"

5. Paciente: "sim"

6. Agente cria o agendamento:
   POST /api/agent/v1/appointments
   { professional_id, service_id, starts_at, patient_name, patient_phone }
   → { id, confirmation_code: "A1B2C3", status: "BOOKED", ... }

7. Agente responde: "Agendado! Seu código de confirmação é A1B2C3 ✅"
```
