# Agent Gate Evaluation Report

GeneratedAt: 2026-04-03T15:17:50.4158230-03:00
InputCsv: ../../tmp/agent-readiness-sample.csv

## Decision

- Decision: ADVANCE_TO_25
- Reason: No threshold breaches or degradation signals detected.

## Metrics Summary

- Total snapshots: 3
- Error snapshots: 0
- Valid snapshots: 3
- Max failure rate: 0.0222
- Avg failure rate: 0.020733
- Max p95 latency ms: 1020
- Avg p95 latency ms: 966.67
- Failure rate breaches: 0 (threshold: 0.05)
- P95 breaches: 0 (threshold: 1500)
- Degraded signals: 0

## Gate Checklist Mapping

- Failure rate within threshold: True
- P95 within threshold: True
- No degraded readiness signals: True
- Sufficient snapshots: True
- No request error concentration: True

## Notes

- Cross-tenant incidents must still be validated operationally outside this CSV analysis.
- Scheduling/reception functional regressions must still be validated with incident review and frontline checks.
