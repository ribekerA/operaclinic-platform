# Agent Layer Rollout Runbook

Data: 2026-04-03
Escopo: habilitacao progressiva e rollback rapido do agent layer no backend

## Variaveis de controle

- AGENT_LAYER_ENABLED
  - true: habilita processamento automatico do agent bridge
  - false: desabilita processamento automatico do agent bridge
- AGENT_LAYER_ROLLOUT_PERCENTAGE
  - inteiro de 0 a 100
  - define percentual de threads elegiveis para execucao de agent

## Politica recomendada de rollout

1. Iniciar com AGENT_LAYER_ENABLED=true e AGENT_LAYER_ROLLOUT_PERCENTAGE=5 em staging.
2. Validar metricas por pelo menos uma janela operacional completa.
3. Evoluir para 25, 50, 75 e 100 somente sem regressao critica.
4. Manter AGENT_LAYER_ENABLED=true e ajustar somente percentual para controlar exposicao.

## Gates para subir percentual

- sem aumento relevante de skill_failure_rate
- latencia p95 dentro da meta operacional
- handoff por falha sem comportamento anomalo
- sem incidente de tenant cross-context

## Procedimento de rollback

### Rollback rapido (kill switch)

1. Definir AGENT_LAYER_ENABLED=false
2. Recarregar runtime da API conforme procedimento do ambiente
3. Validar em /api/v1/health/readiness se check agent indica disabled
4. Confirmar que inbound messaging nao dispara execucao do agent bridge

### Rollback parcial (reduzir exposicao)

1. Manter AGENT_LAYER_ENABLED=true
2. Definir AGENT_LAYER_ROLLOUT_PERCENTAGE para 0, 5 ou valor seguro
3. Recarregar runtime da API
4. Confirmar em health/readiness e logs de bridge

## Verificacoes operacionais

- endpoint readiness ativo com check agent
- logs de AgentBridge mostrando skip por rollout gate quando aplicavel
- ausencia de erro de validacao de env para percentual
- sem confirmacao indevida de disponibilidade, pagamento ou ativacao por automacao

## Checklist rapido de incidente

- houve aumento de erro por skill?
- houve loop de falha sem handoff?
- houve risco de impacto multi-tenant?
- houve degradacao relevante de latencia?

Se qualquer resposta for sim, aplicar rollback rapido e abrir analise de causa raiz.

## Execucao assistida - staging 5%

Objetivo: executar rollout inicial com exposicao controlada e evidencias auditaveis para decisao de avancar para 25%.

Alias uteis no root do monorepo:

```powershell
npm run api:ready:check
npm run api:ready:strict
npm run api:start:dev
npm run agent:gate:run:local
npm run agent:gate:run:cwd
```

Uso recomendado no ambiente local:
1. Verificar readiness primeiro.
2. `npm run start:dev` no root agora e seguro: se o readiness ja responder, o comando encerra com sucesso sem tentar subir uma segunda instancia.
3. Rodar o gate local depois que o endpoint responder.
4. Publicacoes locais sao redirecionadas automaticamente para `tmp/AGENT_GATE_LOCAL_VALIDATION.md`, mesmo se alguem apontar manualmente para o documento oficial.
5. Quando `npm run api:ready:check` retornar `degraded`, usar `npm run api:ready:strict` para falhar explicitamente e listar as dependencias que ainda impedem um estado totalmente saudavel.

Guardrails obrigatorios do pipeline:
- Ambientes nao-locais falham cedo se forem executados com parametros inseguros de laboratorio: `DurationHours < 1`, `MinSnapshots < 3` ou `ValidationDoc` apontando para `tmp/*`.
- Ambientes nao-locais devem sempre publicar no documento oficial de validacao operacional. O pipeline bloqueia explicitamente qualquer tentativa de publicar staging em arquivo temporario/local.

Atalho operacional recomendado:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/run-agent-gate.ps1 `
  -BaseUrl "https://SEU-STAGING" `
  -BearerToken "SEU_TOKEN" `
  -IntervalMinutes 15 `
  -DurationHours 24 `
  -FailureRateThreshold 0.05 `
  -P95ThresholdMs 1500 `
  -MinSnapshots 3 `
  -Environment "staging" `
  -OutputCsv "agent-readiness-staging-5pct.csv" `
  -OutputReport "agent-gate-report-staging-5pct.md" `
  -ValidationDoc "docs/AI_OPERATIONAL_VALIDATION_2026-04-03.md"
```

### Passo 1 - Preparacao do ambiente

1. Garantir variaveis em staging:
  - AGENT_LAYER_ENABLED=true
  - AGENT_LAYER_ROLLOUT_PERCENTAGE=5
  - AGENT_METRICS_WINDOW_MINUTES=15
  - AGENT_SKILL_FAILURE_RATE_ALERT_THRESHOLD=0.05
  - AGENT_SKILL_P95_ALERT_MS=1500
2. Publicar configuracao e recarregar runtime da API.
3. Registrar timestamp de inicio da janela de observacao (T0).

### Passo 2 - Validacao de partida (T0)

1. Consultar readiness e validar check do agent sem degradacao inicial.
2. Confirmar em logs do AgentBridge que parte das threads e processada e parte e bloqueada pelo rollout gate.
3. Confirmar ausencia de erro de validacao de ambiente para percentual de rollout.

### Passo 3 - Janela de observacao (T0 ate T+24h)

1. Coletar snapshots periodicos de readiness/metricas por skill.
2. Acompanhar:
  - skill_failure_rate por skill e agregado
  - p95 de latencia por skill e agregado
  - volume de handoff por falha tecnica
  - sinais de risco multi-tenant
3. Em caso de limiar excedido ou anomalia critica, aplicar rollback rapido imediatamente.

### Passo 4 - Decisao de gate (T+24h)

1. Gerar relatorio automatico a partir do CSV coletado:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/evaluate-agent-gate.ps1 `
  -InputCsv "agent-readiness-staging-5pct.csv" `
  -FailureRateThreshold 0.05 `
  -P95ThresholdMs 1500 `
  -MinSnapshots 3 `
  -OutputMarkdown "agent-gate-report-staging-5pct.md"
```

2. Usar a decisao sugerida no relatorio como base para o gate final.
3. Publicar o resultado no documento oficial; republicacoes do mesmo ambiente devem substituir a entrada anterior, nao criar duplicata.
4. Se o ambiente informado for local e o operador apontar acidentalmente para o documento oficial, o publicador redireciona automaticamente para tmp/AGENT_GATE_LOCAL_VALIDATION.md.

Avancar para 25% somente se todos os criterios abaixo forem verdadeiros:
- sem incidente de tenant cross-context
- failure_rate dentro do limiar acordado
- p95 dentro da meta operacional
- sem loop de falha sem handoff
- sem regressao funcional critica em scheduling/recepcao/mensageria

Caso contrario:
- manter 5% com plano corretivo, ou
- reduzir para 0% com kill switch, conforme severidade.

## Evidencias minimas para auditoria do gate

- print/log do readiness no T0 e no T+24h
- consolidado de failure_rate e p95 por skill na janela
- registro de incidentes (ou ausencia de incidentes) multi-tenant
- decisao final do gate (avanco, manutencao ou rollback) com justificativa curta
