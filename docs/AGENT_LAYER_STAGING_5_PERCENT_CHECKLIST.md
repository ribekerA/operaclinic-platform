# Checklist de Execucao - Staging 5% (Agent Layer)

Data de referencia: 2026-04-03
Objetivo: validar rollout inicial com seguranca operacional e evidencias para gate de 25%.

## 1. Preparacao (antes de T0)

Atalhos do monorepo:

```powershell
npm run api:ready:check
npm run api:ready:strict
npm run api:start:dev
npm run agent:gate:run:local
npm run agent:gate:run:cwd
```

Sequencia recomendada no local:
1. Rodar `npm run api:ready:check`.
2. Se a API nao estiver acessivel, rodar `npm run api:start:dev`.
3. Com a API acessivel, rodar o gate local.
4. Evidencias locais devem ir para `tmp/AGENT_GATE_LOCAL_VALIDATION.md`; o documento oficial fica reservado para staging.
5. O pipeline bloqueia execucoes nao-locais com `DurationHours < 1`, `MinSnapshots < 3` ou tentativa de publicar em `tmp/*`.
6. Se o readiness responder com `degraded`, rodar `npm run api:ready:strict` para transformar o estado parcial em falha operacional explicita antes do rollout oficial.

Se o terminal estiver com cwd derivado ou incerto, reposicionar explicitamente no root do repositório antes dos comandos do monorepo.

- [ ] AGENT_LAYER_ENABLED=true aplicado em staging
- [ ] AGENT_LAYER_ROLLOUT_PERCENTAGE=5 aplicado em staging
- [ ] AGENT_METRICS_WINDOW_MINUTES=15 validado
- [ ] AGENT_SKILL_FAILURE_RATE_ALERT_THRESHOLD=0.05 validado
- [ ] AGENT_SKILL_P95_ALERT_MS=1500 validado
- [ ] Runtime da API recarregado
- [ ] Timestamp T0 registrado: ______________________

## 2. Verificacao inicial (T0)

- [ ] Health/readiness retorna check do agent sem estado degradado inicial
- [ ] Logs do bridge mostram gate de rollout ativo (parte processa, parte skip)
- [ ] Sem erro de validacao de env no boot

Observacoes T0:

- ________________________________________________
- ________________________________________________

## 3. Coleta operacional (T0 ate T+24h)

Preencher pelo menos no inicio, meio e fim da janela.

Opcional (automatizado):

```powershell
powershell -ExecutionPolicy Bypass -File scripts/collect-agent-readiness.ps1 `
	-BaseUrl "https://SEU-STAGING" `
	-BearerToken "SEU_TOKEN" `
	-IntervalMinutes 15 `
	-DurationHours 24 `
	-OutputCsv "agent-readiness-staging-5pct.csv"
```

Pipeline completo em um comando:

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

Geracao de decisao automatica do gate (apos coleta):

```powershell
powershell -ExecutionPolicy Bypass -File scripts/evaluate-agent-gate.ps1 `
	-InputCsv "agent-readiness-staging-5pct.csv" `
	-FailureRateThreshold 0.05 `
	-P95ThresholdMs 1500 `
	-MinSnapshots 3 `
	-OutputMarkdown "agent-gate-report-staging-5pct.md"
```

| Timestamp | Failure rate agregado | P95 agregado (ms) | Skill mais critica | Handoff por falha | Incidente tenant | Acao |
|-----------|------------------------|-------------------|--------------------|-------------------|------------------|------|
| T0        |                        |                   |                    |                   |                  |      |
| T+12h     |                        |                   |                    |                   |                  |      |
| T+24h     |                        |                   |                    |                   |                  |      |

## 4. Criterios de gate para 25%

- [ ] Sem incidente de cross-tenant
- [ ] Failure rate <= limiar acordado
- [ ] P95 <= limiar acordado
- [ ] Sem loop de falha sem handoff
- [ ] Sem regressao critica em scheduling/recepcao/mensageria

Decisao do gate:

- [ ] Avancar para 25%
- [ ] Manter em 5%
- [ ] Rollback para 0%

Publicacao automatizada no documento de validacao:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/publish-agent-gate-result.ps1 `
	-ReportMarkdown "agent-gate-report-staging-5pct.md" `
	-ValidationDoc "docs/AI_OPERATIONAL_VALIDATION_2026-04-03.md" `
	-Environment "staging" `
	-EvidenceCsv "agent-readiness-staging-5pct.csv" `
	-EvidenceReport "agent-gate-report-staging-5pct.md"
```

Observacao operacional:
- republicar o mesmo ambiente substitui a entrada anterior no documento oficial, evitando duplicidade e drift.

Justificativa auditavel curta:

- ________________________________________________

Responsavel:

- Nome: ______________________
- Data/hora: __________________
