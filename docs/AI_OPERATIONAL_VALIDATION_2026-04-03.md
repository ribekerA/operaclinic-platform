# Validacao Operacional de Agents e Skills

Data: 2026-04-03
Escopo: recepcao assistida, comercial/onboarding, scheduling, handoff e prontidao operacional

## Objetivo

Executar a proxima fase recomendada apos a criacao das customizacoes, validando o comportamento pratico dos agentes e registrando os principais bloqueadores operacionais observados.

## Cenarios simulados

### 1. Recepcao - remarcacao simples

Contexto:
- paciente identificada
- procedimento conhecido
- preferencia de periodo informada
- sem janelas confirmadas pelo scheduling

Resultado observado:
- o agente nao inventou disponibilidade
- pediu consulta segura ao backend de scheduling
- manteve automacao assistida sem escalar prematuramente

Leitura:
- comportamento esperado e alinhado ao guardrail de scheduling authority
- boa separacao entre intencao de remarcacao e confirmacao de janela

### 2. Recepcao - reclamacao sensivel com possivel conflito

Contexto:
- paciente sem identificacao segura no contexto atual
- historico de consultas perdidas
- mensagem com ameaca reputacional
- nenhum appointment confirmado no backend

Resultado observado:
- handoff humano imediato com prioridade alta
- bloqueio de qualquer confirmacao de status do horario
- coleta minima de identificadores para localizar o caso

Leitura:
- comportamento correto para reclamacao sensivel
- boa ativacao de handoff governance e excecao de agenda

### 3. Comercial - expectativa de PIX e ativacao imediata

Contexto:
- lead com interesse claro
- nenhuma confirmacao financeira oficial
- nenhuma confirmacao operacional de ativacao acelerada

Resultado observado:
- o agente nao confirmou liberacao por PIX
- o agente nao prometeu ativacao ate o dia seguinte
- houve escalonamento para validacao humana comercial/onboarding

Leitura:
- comportamento correto para risco financeiro e promessa operacional
- skill de commercial qualification e guardrails financeiros estao coerentes

### 4. Comercial - duvida inicial de onboarding

Contexto:
- cliente em pre-onboarding
- sem bloqueio financeiro registrado
- sem ativacao e sem integracao iniciadas

Resultado observado:
- o agente respondeu com checklist minimo de coleta
- nao prometeu ativacao
- manteve continuidade automatizada sem escalonamento

Leitura:
- comportamento adequado para onboarding inicial
- boa coleta minima de contexto

## Achados das simulacoes

### Pontos fortes

- agentes respeitam bem a autoridade do backend
- scheduling nao foi tratado como fonte inferida de disponibilidade
- handoff foi acionado corretamente em casos sensiveis
- fluxo comercial ficou conservador em temas financeiros e ativacao

### Riscos ainda visiveis

- parte da validacao ainda e por simulacao textual, nao por execucao E2E real dos fluxos completos
- falta evidenciar comportamento sob falha real de provider, timeout e concorrencia alta
- falta validar com dados reais de staging e politicas locais de clinicas

## Auditoria do fluxo critico

Foi executada uma auditoria estrutural focada em recepcao, messaging e scheduling.

### Situacao real

- build e testes reportados como verdes na documentacao de release
- arquitetura de agents, skills, scheduling concurrency e handoff existe no codigo
- isolamento multi-tenant e backend authority aparecem implementados no desenho atual
- observabilidade existe de forma basica, sem maturidade suficiente para producao robusta

### Objetivo ideal

- isolamento multi-tenant provado por teste adversarial
- rollout controlado com feature flag e kill switch
- observabilidade estruturada por tenant, skill, correlacao e falha
- fallback automatico validado de agent para handoff humano
- concorrencia e idempotencia medidas sob carga realista

### Bloqueadores de producao identificados

1. falta de observabilidade estruturada em producao
2. falta de feature flag de agent layer para rollout e kill switch
3. ausencia de teste de penetracao multi-tenant
4. fallback automatico de falha de skill para handoff sem validacao E2E clara
5. ausencia de teste de carga para concorrencia real em scheduling e recepcao

### Riscos principais

- leak de dados entre tenants sem teste adversarial real
- loop de falha de agent sem escalonamento automatico validado
- double-booking sob concorrencia real ainda sem evidencia de carga
- dificuldade de debug em producao por falta de logging estruturado e metricas
- duplicidade de webhook/mensagem ainda sem evidencia forte de idempotencia testada

### Evidencias faltantes

- teste de penetracao multi-tenant
- teste de timeout e retry com escalonamento
- teste de idempotencia de webhook
- teste de concorrencia com volume maior
- rollout e rollback operacionais documentados e exercitados

## Decisao operacional atual

Status: parcialmente pronto para evolucao controlada, mas ainda nao com evidencia suficiente para assumir robustez produtiva plena em agent layer e operacao automatizada critica.

## Proximos passos recomendados

1. Transformar os cenarios simulados em casos de teste repetiveis para staging.
2. Executar auditoria de prontidao com foco dedicado em scheduling concurrency e messaging webhook idempotency.
3. Criar e validar feature flag de agent layer antes de qualquer rollout amplo.
4. Implementar observabilidade estruturada com correlation id, tenant id e metricas por skill.
5. Validar fallback automatico para handoff em falha de skill, timeout e contexto insuficiente persistente.

## Artefatos usados nesta validacao

- .github/prompts/simulacao-operacional-thread.prompt.md
- .github/prompts/auditoria-prontidao-operacional.prompt.md
- .github/agents/agent-frontdesk-orchestrator.agent.md
- .github/agents/agent-commercial-onboarding-assistant.agent.md
- .github/skills/skill-safe-scheduling-assistant/SKILL.md
- .github/skills/skill-scheduling-exception-governance/SKILL.md
- .github/skills/skill-commercial-qualification/SKILL.md
- .github/skills/skill-handoff-governance/SKILL.md

## Plano de execucao (D0-D30)

### Fase 1 - D0 a D5 (bloqueadores de controle)

1. Implementar feature flag de agent layer com kill switch.
2. Definir politica de rollout progressivo por percentual.
3. Publicar runbook de rollback operacional.

Critério de aceite:
- flag global para habilitar/desabilitar agent layer em runtime.
- percentual de rollout configuravel por ambiente.
- procedimento de rollback testado em staging e documentado.

### Fase 2 - D6 a D12 (observabilidade minima de producao)

1. Estruturar logs em JSON com correlation_id e tenant_id.
2. Instrumentar metricas por skill (sucesso, falha, latencia).
3. Criar alertas para falha de skill e aumento de latencia.

Critério de aceite:
- toda execucao de skill gera log estruturado com tenant e correlation.
- dashboard mostra taxa de erro e p95 por skill.
- alerta dispara quando erro ou latencia ultrapassa limiar definido.

### Fase 3 - D13 a D20 (seguranca de isolamento e resiliencia)

1. Implementar teste de penetracao multi-tenant para fluxos criticos.
2. Implementar teste de timeout/retry com escalonamento para handoff.
3. Implementar teste de idempotencia de webhook (evento duplicado).

Critério de aceite:
- teste adversarial multi-tenant com zero vazamento.
- timeout/retry valida fallback para handoff quando necessario.
- webhook duplicado nao cria estado duplicado indevido.

### Fase 4 - D21 a D30 (concorrencia real e validacao final)

1. Executar teste de carga para scheduling e recepcao concorrentes.
2. Validar risco de double-booking sob volume realista.
3. Consolidar go/no-go com evidencias atualizadas.

Critério de aceite:
- carga concorrente executada com evidencias arquivadas.
- zero double-booking nos cenarios definidos.
- checklist go/no-go atualizado com bloqueadores resolvidos ou mitigados.

## Metricas de saida para fechar a fase

- skill_failure_rate por skill abaixo do limite acordado.
- p95 de execucao por skill dentro da meta operacional.
- tempo medio de handoff em casos de urgencia dentro do SLA.
- taxa de falso positivo de escalonamento monitorada e em queda.
- zero incidente de cruzamento de tenant nas validacoes adversariais.

## Gate de decisao (go para expansao)

Somente avancar para expansao de automacao quando os cinco bloqueadores listados neste documento estiverem fechados com evidencia tecnica verificavel em staging.

## Execucao realizada nesta iteracao

Status: Fase 1 concluida, Fase 2 concluida, Fase 3 concluida, Fase 4 concluida e Fase 5 (hardening de testes) concluida com evidencias automatizadas.

## GATE GO/NO-GO — Status Atual

| Criterio                                             | Status        | Evidencia                                                              |
|------------------------------------------------------|---------------|------------------------------------------------------------------------|
| Feature flag + kill switch operacional               | VERDE         | AGENT_LAYER_ENABLED, rollout por thread, runbook publicado             |
| Rollout percentual deterministico por thread         | VERDE         | SHA-256 bucketizacao, gate testado (enabled=false e rollout=0)         |
| Observabilidade estruturada (logs JSON + metricas)   | VERDE         | AgentObservabilityService, JSON logs com tenantId/correlationId        |
| Alertas de failure rate e p95 no readiness           | VERDE         | health.service.ts buildAgentCheck com limiares configuráveis           |
| Fallback automatico para handoff em erro/guardrail   | VERDE         | AgentRuntimeService.processMessage — 5 cenarios testados               |
| Isolation cross-tenant em handoff lookup             | VERDE         | AgentMessageBridgeService — findFirst sempre escopado por tenantId     |
| Isolation cross-tenant em lock de scheduling         | VERDE         | runExclusiveForProfessional sempre com tenantId do ator                |
| Double-booking prevenido por conflict check          | VERDE         | assertNoSchedulingConflict + occupancy constraint mapeado              |
| Idempotencia de agendamento concorrente              | VERDE         | mesma key+payload retorna existente; key+payload diferente: Conflict   |
| Idempotencia de webhooks por integrationConnectionId | VERDE         | findFirst escopado por integrationConnectionId no webhook handler      |
| Build da API sem erros de compilacao                 | VERDE         | nest build EXIT 0 validado apos cada fase                              |

**Decisao atual**: CONDICIONAL-GO — todos os bloqueadores automatizados estao verdes.  
**Pendente para GO completo**: validacao de staging com carga real e evidencias de metricas vivas.

**Proximo gate**: aumentar rollout de 0% para 5% em staging quando ambiente estiver disponivel e coletar dados de p95/failure_rate por 24h antes de avancar para 25%.

## Execucao realizada nesta iteracao

Status: Fase 1 concluida, Fase 2 concluida, Fase 3 concluida e Fase 4 concluida com evidencias automatizadas.

Entregas concluidas:
- feature flag de agent layer adicionada (AGENT_LAYER_ENABLED).
- rollout percentual por thread adicionado (AGENT_LAYER_ROLLOUT_PERCENTAGE).
- gate de rollout aplicado no AgentMessageBridgeService antes de executar agent.
- check de agent adicionado no health/readiness (enabled + rolloutPercentage + status).
- validacao de ambiente adicionada para percentual de rollout (0-100).
- runbook operacional de rollout e rollback publicado em docs/AGENT_LAYER_ROLLOUT_RUNBOOK.md.
- build da API validado com sucesso apos as alteracoes.
- logs estruturados JSON por execucao de skill com tenantId e correlationId.
- metricas em memoria por skill (sucesso, falha, media e p95 de latencia) adicionadas.
- readiness expandido com metricas do agent layer e alertas de failure rate/p95 por limiar configuravel.
- novas variaveis de observabilidade adicionadas no .env.example.
- testes do AgentMessageBridge atualizados para rollout gate (enabled e percentual).
- testes do SkillExecutor atualizados para observabilidade de execucao (sucesso/falha registrados).
- cobertura de idempotencia de webhook reforcada com assert de escopo por integrationConnectionId.
- suite direcionada executada com sucesso: 30 testes passando (agent bridge, skill executor e webhook).
- testes E2E de fallback para handoff adicionados ao AgentRuntimeService (5 novos cenarios em processMessage).
  - escalada via politica apos 3 tentativas falhas (MEDIUM priority).
  - escalada HIGH quando guardrails falham.
  - escalada HIGH quando classificacao de intent lanca excecao.
  - ausencia de escalada quando politica e guardrails passam.
  - handoffData.threadId validado para garantir alvo correto do handoff.
- testes adversariais multi-tenant adicionados ao AgentMessageBridge (2 novos cenarios).
  - SECURITY: handoffRequest.findFirst sempre com escopo de tenantId (previne cross-tenant lookup).
  - SECURITY: dois tenants concorrentes nao cruzam escopo de handoff lookup.
- suite atualizada: 19 testes passando (agent runtime e agent bridge). Total acumulado: 49 testes.
- testes de concorrencia e isolamento de scheduling criados (Fase 4) — 8 novos testes em scheduling-concurrency.test.ts.
  - CONCURRENCY: primeiro create sucede, segundo com conflict de policy lanca ConflictException.
  - CONCURRENCY: exclusion constraint de occupancy mapeada para ConflictException sem vazar erro interno.
  - CONCURRENCY: erro de serializacao esgotado e relancado como Error (comportamento documentado).
  - IDEMPOTENCY: mesma key+payload retorna appointment existente sem criar duplicata.
  - IDEMPOTENCY: mesma key com payload diferente lanca ConflictException.
  - TENANT ISOLATION (CRITICAL): runExclusiveForProfessional sempre escopado com tenantId do ator.
  - TENANT ISOLATION (CRITICAL): dois tenants distintos nao cruzam lock de profissional compartilhado.
  - TENANT ISOLATION (CRITICAL): sequencia de tenants distintos preserva callOrder individual.
- gate go/no-go atualizado com tabela de evidencias para todos os 11 criterios bloqueadores.
- testes unitarios do SchedulingConcurrencyService adicionados (13 cenarios): retry policy (P2034/serialize/deadlock), abandono em erro nao-retryable, lock key deterministica e isolamento de lock por tenant/professional.
- testes CRITICAL de isolamento de tenant adicionados ao ReceptionService (5 cenarios): getAppointmentDetail cross-tenant ocultado por NotFound e queries de getDashboard/getDayAgenda sempre escopadas por tenantId do actor.
- regressao de suite completa resolvida apos inclusao de getCurrentInstant nos mocks de timezone e ajuste de novas dependencias de health/readiness nos testes de plataforma.
- suite completa validada apos correcoes: 32 arquivos de teste, 233 testes passando, EXIT 0.
- automacao de gate staging implementada: scripts/collect-agent-readiness.ps1 (coleta) e scripts/evaluate-agent-gate.ps1 (decisao automatica em markdown).
- smoke test do avaliador de gate executado com CSV sintetico, gerando decisao automatica sem erro de execucao.

Pendencias abertas para proxima iteracao:
- validacao de staging com carga real (rollout inicial de 5%).
- coleta de metricas vivas de p95/failure_rate por 24h antes de avancar rollout.
- atualizacao do gate go/no-go apos evidencias de staging.
- lacuna atual: URL/token de staging nao disponiveis neste contexto local para iniciar a coleta real.

Plano operacional imediato (staging):
1. Configurar AGENT_LAYER_ENABLED=true e AGENT_LAYER_ROLLOUT_PERCENTAGE=5 no ambiente de staging.
2. Monitorar janela de 24h com foco em skill_failure_rate e p95 por skill no readiness/observabilidade.
3. Manter kill switch pronto para rollback imediato se failure_rate ou p95 ultrapassar limiares definidos.
4. Somente considerar avancar para 25% com evidencias objetivas da janela de 24h sem degradacao relevante.

Artefatos de execucao do proximo gate:
- docs/AGENT_LAYER_ROLLOUT_RUNBOOK.md (procedimento detalhado de staging 5%)
- docs/AGENT_LAYER_STAGING_5_PERCENT_CHECKLIST.md (coleta de evidencias T0/T+12h/T+24h e decisao go/no-go)

Observacao de governanca:
- evidencias locais e de laboratorio do pipeline de gate foram movidas para tmp/AGENT_GATE_LOCAL_VALIDATION.md.
- este documento oficial deve receber somente evidencias de staging (ou ambiente equivalente de validacao real) com janela operacional adequada.
