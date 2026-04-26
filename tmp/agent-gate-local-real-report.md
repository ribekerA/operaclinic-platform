# Agent Gate Evaluation Report

GeneratedAt: 2026-04-03T15:22:12.9945215-03:00
InputCsv: ../../tmp/agent-readiness-local-real.csv

## Decision

- Decision: HOLD_AT_5
- Reason: Insufficient snapshots for a reliable 24h decision.

## Metrics Summary

- Total snapshots: 1
- Error snapshots: 0
- Valid snapshots: 1
- Max failure rate: 0
- Avg failure rate: 0
- Max p95 latency ms: 0
- Avg p95 latency ms: 0
- Failure rate breaches: 0 (threshold: 0.05)
- P95 breaches: 0 (threshold: 1500)
- Degraded signals: 0

## Gate Checklist Mapping

- Failure rate within threshold: True
- P95 within threshold: True
- No degraded readiness signals: True
- Sufficient snapshots: False
- No request error concentration: True

## Notes

- Cross-tenant incidents must still be validated operationally outside this CSV analysis.
- Scheduling/reception functional regressions must still be validated with incident review and frontline checks.
