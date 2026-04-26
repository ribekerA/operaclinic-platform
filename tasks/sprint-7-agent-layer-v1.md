# Sprint 7 - Agent Layer V1

## Header
- Task ID: SPRINT-7-AGENT-LAYER-V1
- Sprint: 7
- Title: Agent runtime enxuto para captacao e agendamento
- Owner: Codex
- Status: Done
- Priority: P0

## Context
- Business context:
  Construir a primeira camada operacional de agentes do OperaClinic para clinica estetica privada, usando WhatsApp como canal do paciente e mantendo recepcao como destino obrigatorio do handoff humano.
- Related decisions (`docs/decisions.md`):
  D-001 Multi-tenant baseline
  D-002 Patient channel in MVP
  D-003 Reception channel in MVP
  D-005 Check-in ownership
  D-007 Schedule source of truth
  D-010 AI role boundary
  D-012 Testability and cost policy
- Related modules:
  messaging, skill-registry, patients, scheduling, reception, auth

## Objective
- Entregar uma Agent Layer v1 enxuta com runtime seguro, Agente de Captacao e Agente de Agendamento, usando apenas skills tipadas e o core backend existente, sem implementar agente supervisor, automacao clinica ampla ou logica oculta fora do backend.

## Scope
- In scope:
  - Modulo `agent` no backend
  - Runtime interno para execucao rastreavel de skills
  - Contratos tipados para requests/responses dos agentes
  - Agente de Captacao com classificacao simples e handoff quando necessario
  - Agente de Agendamento com busca de slots, hold seguro e criacao controlada de agendamento
  - Integracao segura com mensageria para outbound automatizado basico
  - Testes minimos do runtime e dos dois agentes
- Out of scope:
  - Reativacao automatica
  - Agente de supervisao
  - Pricing inteligente
  - Negociacao automatica
  - Respostas clinicas complexas
  - Escrita direta no banco ou no provider sem passar pelo core

## Deliverables
- Documentation:
  - Este arquivo atualizado
- Code:
  - Runtime e orquestracao do modulo `agent`
  - Contratos compartilhados minimos em `packages/shared`
  - Integracao segura com `skill-registry` e `messaging`
- Tests:
  - Unit tests para runtime
  - Unit tests para agentes de captacao e agendamento

## Acceptance criteria
1. O runtime executa skills tipadas com tenant context obrigatorio, actor valido e rastreabilidade basica.
2. O Agente de Captacao identifica cenarios simples de lead, busca/cria paciente quando aplicavel e abre handoff quando necessario.
3. O Agente de Agendamento busca disponibilidade, segura slot e cria agendamento apenas com dados suficientes e via skills do core.
4. O envio outbound automatizado passa pela boundary de messaging sem relaxar regras de handoff humano na recepcao.
5. A camada fica pronta para futura orquestracao por LLM sem colocar logica clinica em prompts ou no provider.

## Test plan
- Unit tests:
  - `AgentRuntimeService`
  - `CaptacaoAgentService`
  - `AgendamentoAgentService`
- Integration tests:
  - Execucao do runtime com skill registry mockado
  - Fluxos de handoff e agendamento via skills mockadas
- Mocks required:
  - `SkillRegistryService`
  - Boundary de messaging
- Estimated external API cost impact:
  - Zero nesta sprint

## Tenant and security checks
- Tenant isolation impact:
  Toda execucao precisa carregar `tenantId` explicito e nunca pode atravessar tenant.
- Access control impact:
  O actor executante continua sendo um usuario clinico real com role valida; o request externo nao pode forjar `actorUserId`.
- Sensitive data handling:
  Nenhum agente pode tocar segredos de provider ou banco diretamente; apenas skills/core autorizados.

## Dependencies and risks
- Dependencies:
  - Messaging foundation pronta
  - Skill registry pronto
  - Scheduling endurecido
  - Patients e reception operacionais
- Risks:
  - Forja de contexto do actor
  - Agente enviar mensagem automatica em fluxo humano sem controle
  - Autoagendamento com dados ambiguos
  - Drift entre contratos shared e runtime
- Mitigations:
  - Contexto construido no backend a partir da sessao autenticada
  - Outbound automatizado separado do reply humano de handoff
  - Confirmacao explicita de slot antes de criar appointment
  - Contratos compartilhados em `packages/shared`

## Completion evidence
- PR/commit reference:
  - Local workspace
- Evidence links:
  - `pnpm --filter @operaclinic/shared build`
  - `pnpm --filter @operaclinic/api test`
  - `pnpm --filter @operaclinic/api typecheck`
  - `pnpm --filter @operaclinic/api build`
- Notes:
  - Esta sprint nao implementa orquestrador por LLM; apenas a fundacao segura para a proxima fase.
  - Evidencia validada em 17-mar-2026 com:
    - `pnpm --filter @operaclinic/shared build`
    - `pnpm --filter @operaclinic/api test`
    - `pnpm --filter @operaclinic/api typecheck`
    - `pnpm --filter @operaclinic/api build`
