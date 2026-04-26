# Sprint 6 - Messaging Foundation

## Header
- Task ID: SPRINT-6-MESSAGING-FOUNDATION
- Sprint: 6
- Title: Messaging foundation para WhatsApp como canal do paciente
- Owner: Codex
- Status: Done
- Priority: P0

## Context
- Business context:
  Construir a base de mensageria do OperaClinic para clinica estetica privada, com WhatsApp como canal do paciente e recepcao como destino operacional do handoff humano.
- Related decisions (`docs/decisions.md`):
  D-001 Multi-tenant baseline
  D-002 Patient channel in MVP
  D-003 Reception channel in MVP
  D-005 Check-in ownership
  D-007 Schedule source of truth
  D-009 Billing boundary
  D-010 AI role boundary
  D-012 Testability and cost policy
- Related modules:
  auth, identity, patients, reception, scheduling, integrations futuras, control plane

## Objective
- Criar a fundacao de mensageria multi-tenant para receber eventos inbound, persistir threads e eventos, enviar outbound via adapter, abrir e fechar handoff para recepcao, manter rastreabilidade ponta a ponta e deixar o backend pronto para uma agent layer futura sem deixar o WhatsApp escrever direto no core clinico.

## Scope
- In scope:
  - Modulo `messaging` no backend
  - Persistencia de threads, eventos, webhooks, handoffs, templates e connections
  - Endpoints minimos de threads, handoffs, templates, integrations e webhook WhatsApp
  - Adapter/boundary para provider de mensageria com mock
  - Vinculo opcional e seguro com paciente quando houver identificacao confiavel
  - Auditoria minima e logs minimos
  - Testes minimos do modulo
- Out of scope:
  - Agente completo de IA
  - Escrita direta em appointments via WhatsApp
  - Automacao clinica fora do fluxo de mensageria
  - UI completa da recepcao para mensageria nesta sprint
  - Provider real de WhatsApp em producao

## Deliverables
- Documentation:
  - Este arquivo de sprint atualizado
- Code (if applicable):
  - Schema/migration do modulo messaging
  - Modulo NestJS com services, controllers, DTOs e adapters
  - Contratos minimos em `packages/shared` se necessario
- Tests:
  - Unit/integration tests minimos cobrindo threads, eventos, handoff, webhook e adapter mock

## Acceptance criteria
1. O backend persiste `message_threads`, `message_events`, `webhook_events`, `handoff_requests`, `message_templates` e `integration_connections` com tenant isolation.
2. Os endpoints minimos de threads, handoffs, templates, integrations e webhook WhatsApp estao disponiveis e funcionais.
3. O modulo suporta inbound, outbound via adapter, handoff open/close e rastreabilidade do fluxo sem escrever direto em scheduling.
4. O modelo suporta thread sem paciente vinculado e vinculo seguro quando houver identificacao confiavel.
5. A base fica pronta para uma camada futura de agent/orchestration sem acoplar provider de WhatsApp ao core.

## Test plan
- Unit tests:
  - Messaging service
  - Handoff lifecycle
  - Webhook processing
  - Provider mock adapter
- Integration tests:
  - Persistencia de thread/evento
  - Listagem e leitura de thread
  - Criacao e fechamento de handoff
- Contract tests:
  - DTOs/responses do modulo
- Mocks required:
  - Adapter de WhatsApp mock
- Estimated external API cost impact:
  - Zero nesta sprint

## Tenant and security checks
- Tenant isolation impact:
  Toda thread, evento, handoff, template e connection deve ser tenant-scoped.
- Access control impact:
  Recepcao, gestor e admin de clinica podem operar threads/handoffs conforme RBAC atual; provider/webhook continua fora da area autenticada.
- Sensitive data handling:
  Tokens/segredos de integration connection devem ficar protegidos; webhook payload bruto deve ser rastreavel sem expor segredo em respostas.

## Dependencies and risks
- Dependencies:
  - Foundation de auth/RBAC pronta
  - Patients e reception prontos
  - Scheduling estabilizado
  - Shared contracts prontos para extensao
- Risks:
  - Acoplamento indevido entre mensageria e scheduling
  - Relaxamento de tenant isolation no webhook
  - Adapter crescer como core errado
  - Handoff sem ownership claro
- Mitigations:
  - Boundary explicita de provider
  - Backend como dono de estado
  - Tenant resolvido e validado antes de persistir
  - Handoff como entidade de primeiro nivel

## Completion evidence
- PR/commit reference:
  - Local workspace
- Evidence links:
  - `pnpm --filter @operaclinic/shared build`
  - `pnpm --filter @operaclinic/api prisma:generate`
  - `pnpm --filter @operaclinic/api prisma:migrate:deploy`
  - `pnpm --filter @operaclinic/api test`
  - `pnpm --filter @operaclinic/api typecheck`
  - `pnpm --filter @operaclinic/api build`
  - `pnpm --filter @operaclinic/web typecheck`
- Notes:
  - Mock-first nesta sprint; provider real fica para fase posterior.
  - Foram adicionados testes minimos para vinculo seguro de paciente e deduplicacao de webhook.
