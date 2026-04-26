# Agent Gate Local Validation Log

Escopo: evidencias locais e de laboratorio do pipeline de gate.

Regra operacional:
- Este arquivo concentra execucoes locais para evitar drift no documento oficial de validacao de staging.
- O documento oficial continua sendo docs/AI_OPERATIONAL_VALIDATION_2026-04-03.md.
- Somente execucoes de staging com janela operacional valida devem publicar no documento oficial.


## Gate Update - local-runtime-root

- atualizado_em: 2026-04-04 21:31:02
- ambiente: local-runtime-root
- decisao_automatizada: HOLD_AT_5
- justificativa_curta: Insufficient snapshots for a reliable 24h decision.
- max_failure_rate_observado: 0
- max_p95_ms_observado: 0
- evidencia_csv: C:\Users\byimp\OneDrive\Documentos\GitHub\operaclinic-platform\tmp\agent-readiness-local-root.csv
- evidencia_relatorio: C:\Users\byimp\OneDrive\Documentos\GitHub\operaclinic-platform\tmp\agent-gate-local-root.md

Classificacao de confianca:
- fato: decisao extraida automaticamente do relatorio
- lacuna: validacao de incidentes cross-tenant e regressao funcional depende da operacao real
## Gate Update - local-guardrail-test

- atualizado_em: 2026-04-03 17:04:42
- ambiente: local-guardrail-test
- decisao_automatizada: HOLD_AT_5
- justificativa_curta: Insufficient snapshots for a reliable 24h decision.
- max_failure_rate_observado: 0
- max_p95_ms_observado: 0
- evidencia_csv: C:\Users\byimp\OneDrive\Documentos\GitHub\operaclinic-platform\tmp\agent-readiness-local-root.csv
- evidencia_relatorio: C:\Users\byimp\OneDrive\Documentos\GitHub\operaclinic-platform\tmp\agent-gate-local-root.md

Classificacao de confianca:
- fato: decisao extraida automaticamente do relatorio
- lacuna: validacao de incidentes cross-tenant e regressao funcional depende da operacao real

## Gate Update - local-manual-redirect-test

- atualizado_em: 2026-04-03 17:07:47
- ambiente: local-manual-redirect-test
- decisao_automatizada: HOLD_AT_5
- justificativa_curta: Guardrail validation
- max_failure_rate_observado: n/a
- max_p95_ms_observado: n/a
- evidencia_csv: .\tmp\local-guardrail.csv
- evidencia_relatorio: .\tmp\local-guardrail-report.md

Classificacao de confianca:
- fato: decisao extraida automaticamente do relatorio
- lacuna: validacao de incidentes cross-tenant e regressao funcional depende da operacao real

