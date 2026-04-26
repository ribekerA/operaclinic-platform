# Runbook de Execucao WhatsApp (Ordem 2 -> 3 -> 1)

Data: 2026-04-05  
Objetivo: sair de estado ambiguo para operacao previsivel de WhatsApp por clinica, sem pular governanca.

## Ordem oficial

1. Fase 2: Padronizar setup tecnico por clinica
2. Fase 3: Fechar governanca operacional e gate decisorio
3. Fase 1: Validar em campo real (ultimo passo)

Essa ordem evita usar cliente real para descobrir lacunas de processo.

---

## Fase 2 - Setup tecnico por clinica (pronto para operar)

Meta: cada clinica fica tecnicamente habilitada de forma repetivel e auditavel.

### 2.1 Pre-condicoes de ambiente

- `MESSAGING_WHATSAPP_META_ENABLED=true`
- `MESSAGING_WHATSAPP_META_ACCESS_TOKEN` preenchido
- `MESSAGING_WHATSAPP_META_APP_SECRET` preenchido
- Endpoint da API publicado para webhook

Health de referencia:
- `GET /api/v1/health/readiness`
- Check de mensageria valida condicoes em [apps/api/src/modules/health/health.service.ts](apps/api/src/modules/health/health.service.ts#L225)

### 2.2 Cadastro de conexao da clinica

Endpoint existente:
- `POST /api/v1/integrations` (roles: TENANT_ADMIN, CLINIC_MANAGER)
- Implementado em [apps/api/src/modules/messaging/integrations.controller.ts](apps/api/src/modules/messaging/integrations.controller.ts#L30)

Payload minimo recomendado:

```json
{
  "provider": "WHATSAPP_META",
  "displayName": "WhatsApp Clinica X",
  "phoneNumber": "+5511999999999",
  "externalAccountId": "<phone_number_id_meta>",
  "config": {
    "wabaId": "<waba_id>",
    "label": "piloto-abril"
  }
}
```

Resultado esperado:
- conexao criada e ativa
- `verifyToken` retornado para configurar no Meta
- audit log de criacao de integracao

### 2.3 Validacao tecnica da clinica (smoke)

1. Verificar conexao ativa: `GET /api/v1/integrations`
2. Verificar readiness sem erro critico de mensageria
3. Enviar evento de teste inbound (Meta) e confirmar:
   - webhook recebido
   - thread criada/atualizada
   - message event persistido

Referencias:
- webhook controller: [apps/api/src/modules/messaging/whatsapp-webhooks.controller.ts](apps/api/src/modules/messaging/whatsapp-webhooks.controller.ts)
- processamento inbound: [apps/api/src/modules/messaging/whatsapp-webhooks.service.ts](apps/api/src/modules/messaging/whatsapp-webhooks.service.ts)

### Criterio de saida da Fase 2

- 100% dos itens abaixo true por clinica:
  - conexao ativa criada
  - externalAccountId preenchido
  - verify token validado no Meta
  - inbound de teste processado com thread/evento
  - readiness sem erro de credencial

Se algum item falhar: nao entra em Fase 3.

---

## Fase 3 - Governanca operacional (antes de campo)

Meta: deixar decisao, escalonamento e rollback objetivos.

### 3.1 Definir regras de operacao

- SLA de primeira resposta por prioridade:
  - critico: 5 min
  - alto: 10 min
  - medio: 15 min
- gatilhos de handoff obrigatorio:
  - urgencia
  - ambiguidade
  - falha backend/skill
  - tema financeiro sensivel

### 3.2 Definir gate de decisao

Usar pipeline existente de gate:
- `scripts/collect-agent-readiness.ps1`
- `scripts/evaluate-agent-gate.ps1`
- `scripts/run-agent-gate.ps1`

Regra minima para avancar:
- sem incidente cross-tenant
- failure rate <= limiar
- p95 <= limiar
- sem loop de falha sem handoff
- sem regressao critica em scheduling/recepcao/mensageria

Checklist base:
- [docs/AGENT_LAYER_STAGING_5_PERCENT_CHECKLIST.md](docs/AGENT_LAYER_STAGING_5_PERCENT_CHECKLIST.md)

### 3.3 Definir rollback

- kill switch rapido:
  - `AGENT_LAYER_ENABLED=false`
- rollback parcial:
  - reduzir `AGENT_LAYER_ROLLOUT_PERCENTAGE`

Runbook base:
- [docs/AGENT_LAYER_ROLLOUT_RUNBOOK.md](docs/AGENT_LAYER_ROLLOUT_RUNBOOK.md)

### Criterio de saida da Fase 3

- operacao aprovada por Tech Lead + Operacao com:
  - SLA definido
  - dono de plantao definido
  - checklist de incidente definido
  - rollback testado

Sem aprovacao formal: nao entra em Fase 1.

---

## Fase 1 - Validacao em campo real (ultima etapa)

Meta: provar estabilidade e ROI com risco controlado.

### 1.1 Rollout inicial controlado

- `AGENT_LAYER_ENABLED=true`
- `AGENT_LAYER_ROLLOUT_PERCENTAGE=5`
- 1 clinica piloto por vez

### 1.2 Janela de 24h

Coletar evidencias em:
- T0
- T+12h
- T+24h

Publicar decisao no documento oficial:
- [docs/AI_OPERATIONAL_VALIDATION_2026-04-03.md](docs/AI_OPERATIONAL_VALIDATION_2026-04-03.md)

### 1.3 Decisao de gate

Opcoes:
- avancar para 25%
- manter em 5%
- rollback para 0%

### Criterio de saida da Fase 1

- gate com evidencias objetivas de 24h
- sem regressao relevante
- aprovacao para escalar

---

## Matriz de responsabilidade

- Tenancy/Seguranca: Backend Lead
- Integracao WhatsApp por clinica: Squad API + Operacoes
- Gate e observabilidade: SRE/Tech Lead
- Aprovacao de avancar fase: Tech Lead + Dono da Operacao

---

## Sequencia de execucao resumida (na pratica)

1. Fase 2 em todas as clinicas candidatas
2. Fase 3 uma vez por ambiente e equipe
3. Fase 1 por onda (piloto 5% por clinica)
4. Expandir somente apos gate aprovado

Se houver duvida entre velocidade e seguranca, priorizar seguranca operacional.
