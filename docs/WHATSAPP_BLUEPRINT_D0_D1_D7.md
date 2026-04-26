# Blueprint Operacional WhatsApp por Clinica (D0, D1, D7)

Data: 2026-04-05  
Objetivo: transformar a configuracao de WhatsApp em processo fechado, repetivel e auditavel, com validacao de campo apenas no final.

Ordem obrigatoria: 2 -> 3 -> 1
- Fase 2: setup tecnico por clinica
- Fase 3: governanca operacional e gate
- Fase 1: validacao em campo real

Referencias base:
- [docs/WHATSAPP_EXECUTION_2_3_1_RUNBOOK.md](docs/WHATSAPP_EXECUTION_2_3_1_RUNBOOK.md)
- [docs/WHATSAPP_CLINIC_ONBOARDING_CHECKLIST.md](docs/WHATSAPP_CLINIC_ONBOARDING_CHECKLIST.md)
- [docs/AGENT_LAYER_ROLLOUT_RUNBOOK.md](docs/AGENT_LAYER_ROLLOUT_RUNBOOK.md)
- [docs/AGENT_LAYER_STAGING_5_PERCENT_CHECKLIST.md](docs/AGENT_LAYER_STAGING_5_PERCENT_CHECKLIST.md)

---

## D0 - Preparacao e habilitacao tecnica (Fase 2)

Meta do dia:
- clinica tecnicamente conectada e validada sem depender de operacao real.

### Janela sugerida
- 09:00-10:00: pre-check de ambiente
- 10:00-12:00: cadastro de conexao da clinica
- 14:00-16:00: teste inbound/outbound
- 16:00-17:00: fechamento de evidencias e decisao D0

### Passos

1. Pre-check global do ambiente
- validar variaveis Meta no ambiente
- validar readiness de mensageria
- validar endpoint publico de webhook

Ponto de verificacao:
- [apps/api/src/modules/health/health.service.ts](apps/api/src/modules/health/health.service.ts#L225)

2. Cadastro da conexao por clinica
- criar conexao via API de integrations
- registrar externalAccountId e numero oficial
- armazenar verify token e configurar no Meta

Pontos de verificacao:
- [apps/api/src/modules/messaging/integrations.controller.ts](apps/api/src/modules/messaging/integrations.controller.ts#L30)
- [apps/api/src/modules/messaging/integration-connections.service.ts](apps/api/src/modules/messaging/integration-connections.service.ts#L57)

3. Smoke tecnico da clinica
- webhook inbound de teste recebido e processado
- thread criada/atualizada
- outbound de teste com status registrado

Pontos de verificacao:
- [apps/api/src/modules/messaging/whatsapp-webhooks.controller.ts](apps/api/src/modules/messaging/whatsapp-webhooks.controller.ts)
- [apps/api/src/modules/messaging/whatsapp-webhooks.service.ts](apps/api/src/modules/messaging/whatsapp-webhooks.service.ts)

4. Fechamento D0
- preencher checklist por clinica
- emitir decisao APROVADO/REPROVADO para seguir ao D1

Checklist:
- [docs/WHATSAPP_CLINIC_ONBOARDING_CHECKLIST.md](docs/WHATSAPP_CLINIC_ONBOARDING_CHECKLIST.md)

### Criterio de sucesso D0
- conexao ativa criada
- verify token validado
- externalAccountId confirmado
- inbound/outbound testados
- sem erro critico no readiness

Se falhar qualquer item: nao avancar para D1.

---

## D1 - Governanca operacional e readiness para piloto (Fase 3)

Meta do dia:
- processo operacional definido com dono, SLA, gate e rollback.

### Janela sugerida
- 09:00-10:30: workshop rapido de operacao
- 10:30-12:00: definicao de SLA e handoff
- 14:00-15:00: definicao de gate go/no-go
- 15:00-16:00: teste de rollback
- 16:00-17:00: aprovacao formal para entrar em campo

### Passos

1. Definir SLA operacional
- primeira resposta por prioridade
- confirmacao de consulta em janela alvo
- criterios de backlog critico

2. Definir gatilhos de handoff
- urgencia
- ambiguidade
- falha tecnica
- sensivel/financeiro

3. Definir gate de decisao
- sem incidente cross-tenant
- failure rate dentro do limiar
- p95 dentro do limiar
- sem loop de falha sem handoff
- sem regressao critica

4. Testar rollback
- kill switch total
- rollback parcial por percentual

5. Formalizar dono e aprovacao
- responsavel tecnico
- responsavel operacional
- aprovadores de gate

Runbook de referencia:
- [docs/AGENT_LAYER_ROLLOUT_RUNBOOK.md](docs/AGENT_LAYER_ROLLOUT_RUNBOOK.md)

### Criterio de sucesso D1
- SLA e handoff aprovados
- gate objetivo aprovado
- rollback testado
- responsabilidades definidas

Sem aprovacao formal D1: nao entrar em D7.

---

## D7 - Validacao em campo real controlada (Fase 1)

Meta do dia:
- validar estabilidade em operacao real com exposicao minima.

### Janela sugerida
- T0: inicio de rollout 5%
- T+12h: checkpoint intermediario
- T+24h: decisao de gate

### Passos

1. Iniciar rollout controlado
- habilitar agent layer
- percentual em 5%
- 1 clinica piloto por vez

2. Coleta operacional 24h
- capturar failure rate agregado
- capturar p95 agregado
- identificar skill mais critica
- verificar handoff por falha
- verificar incidente tenant

3. Decisao final
- avancar para 25%
- manter em 5%
- rollback para 0%

Checklist oficial:
- [docs/AGENT_LAYER_STAGING_5_PERCENT_CHECKLIST.md](docs/AGENT_LAYER_STAGING_5_PERCENT_CHECKLIST.md)

Publicacao oficial de validacao:
- [docs/AI_OPERATIONAL_VALIDATION_2026-04-03.md](docs/AI_OPERATIONAL_VALIDATION_2026-04-03.md)

### Criterio de sucesso D7
- 24h sem degradacao relevante
- sem incidente cross-tenant
- sem regressao critica
- aprovacao formal para escalar

---

## Matriz de decisao por fase

| Fase | Status esperado | Se falhar | Proxima acao |
|------|------------------|-----------|--------------|
| D0 (setup tecnico) | APROVADO | bloquear piloto | corrigir integracao e retestar |
| D1 (governanca) | APROVADO | bloquear piloto | ajustar SLA/gate/rollback |
| D7 (campo 24h) | GO/NO-GO | manter 5% ou rollback | plano corretivo + nova janela |

---

## KPIs minimos para GO de escala

- availability do fluxo de mensageria estavel
- failure rate do agent abaixo do limiar acordado
- p95 abaixo do limiar acordado
- handoff por falha sem crescimento anomalo
- sem incidente de isolamento de tenant

---

## Regra de ouro

Nao usar cliente real para descobrir falha de processo.
Primeiro fecha D0 e D1, depois valida D7.
