# Testes minimos - base atual

Objetivo: validar os fluxos criticos da base atual com baixo custo, sem inflar a stack antes do modulo de WhatsApp.

## Estado atual
- Backend com `platform`, `identity`, `clinic-structure`, `patients` e `scheduling`.
- Frontend com login, shell por perfil, telas de plataforma, estrutura clinica e recepcao operacional baseline.
- Recepcao agora cobre dashboard, agenda do dia, busca de paciente, criacao manual, confirmacao, check-in, no-show e cancelamento.
- Testes automatizados minimos do backend foram inicializados com `vitest`.

## Backend

### 1) Auth e RBAC
1. `POST /api/v1/auth/login` retorna `accessToken`, `refreshToken`, `user.profile` e `user.roles`.
2. `/api/v1/auth/me` responde com contexto correto do usuario autenticado.
3. Usuario sem role de plataforma recebe `403` em `platform/*`.
4. Usuario clinico fora do `activeTenantId` recebe `403` nas operacoes tenant-aware.

### 2) Clinic structure
1. `GET /api/v1/clinic`, `/units`, `/specialties`, `/professionals` e `/consultation-types` respondem no tenant correto.
2. `TENANT_ADMIN` e `CLINIC_MANAGER` conseguem criar e editar estrutura.
3. `RECEPTION` tem leitura e nao altera estrutura.
4. Tipo de consulta rejeita buffer acima do limite operacional atual.

### 3) Patients
1. `GET /api/v1/patients` encontra paciente por nome, documento e telefone/WhatsApp.
2. `POST /api/v1/patients` cria paciente sem quebrar unicidade de contato.
3. `PATCH /api/v1/patients/:patientId` preserva `tenantId`.
4. `POST /api/v1/patients/find-or-merge` consolida registros sem perder appointments, holds e waitlist.

### 4) Scheduling
1. `POST /api/v1/schedules` exige profissional valido e vinculo com unidade quando `unitId` existir.
2. `POST /api/v1/schedule-blocks` rejeita conflito com blocks, holds e appointments ativos.
3. `GET /api/v1/availability/search` retorna slots apenas dentro da cobertura do profissional no dia local do tenant.
4. `POST /api/v1/availability/hold` cria hold ativo, expira holds vencidos e opera sob lock por profissional.
5. `POST /api/v1/appointments` rejeita conflito, respeita `idempotencyKey` e grava history inicial.
6. `PATCH /api/v1/appointments/:appointmentId/reschedule` grava history e limpa `slotHoldId` obsoleto.
7. `PATCH /api/v1/appointments/:appointmentId/cancel` grava history e motivo de cancelamento.
8. `PATCH /api/v1/reception/appointments/:appointmentId/confirm` marca confirmacao.
9. `PATCH /api/v1/reception/appointments/:appointmentId/check-in` valida o dia local e entra na fila.
10. `PATCH /api/v1/reception/appointments/:appointmentId/no-show` so ocorre apos o inicio do horario.

## Frontend

### 1) Login e sessao
1. `/login/platform` e `/login/clinic` autenticam contra o backend.
2. Sessao invalida redireciona para a tela de login correta.
3. Perfil plataforma nao acessa `/clinic` e perfil clinico nao acessa `/platform`.

### 2) Plataforma
1. Dashboard carrega tenants, planos e usuarios.
2. Lista de tenants cria, edita e troca plano.
3. Tela de planos cria e filtra planos.
4. Tela de usuarios cria usuario clinico, atualiza status e atualiza roles.

### 3) Clinica
1. Dashboard da clinica carrega metricas de estrutura.
2. Telas de unidades, especialidades, profissionais e tipos de consulta refletem o backend.
3. Tela de recepcao opera sobre backend real com agenda do dia, fila e drawer de agendamento.
4. Pacientes e agenda dedicada continuam fora do menu operacional principal nesta fase.

## Gate antes do modulo de WhatsApp
1. `pnpm --filter @operaclinic/shared build`
2. `pnpm --filter @operaclinic/api test`
3. `pnpm --filter @operaclinic/api typecheck`
4. `pnpm --filter @operaclinic/api build`
5. `pnpm --filter @operaclinic/web typecheck`
6. `pnpm --filter @operaclinic/web build`

## Cobertura automatizada minima atual
1. `pnpm --filter @operaclinic/api typecheck`
2. `pnpm --filter @operaclinic/api test`
3. Auth login e refresh
4. Tenant isolation em `patients`
5. `patients/find-or-merge`
6. Scheduling conflict buffered overlap
7. Create appointment
8. Reschedule appointment
9. Cancel appointment
10. Timezone boundary para dia local do tenant

## Pendencias conhecidas
- Concorrencia de agenda ainda precisa de validacao sob carga real e possivel reforco estrutural no banco.
- Falta ampliar a cobertura para fluxos de recepcao ponta a ponta no frontend.
- WhatsApp ainda nao foi iniciado e deve consumir apenas funcoes do backend.
