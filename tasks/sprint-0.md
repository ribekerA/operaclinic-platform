# Sprint 0 - Foundation and Governance

## Status
- Delivered.
- Last reviewed on 2026-03-12.

## Sprint goal
Create the project source-of-truth documentation and operational guardrails before application coding.

## Scope
- Governance docs
- Architecture decision register
- Blueprint and sprint framing
- Templates for task lifecycle
- Test strategy with mock-first policy

## Task backlog
1. Create and validate `docs/AI_RULES.md`.
2. Create and validate `docs/decisions.md`.
3. Create `docs/TASK_TEMPLATE.md` and `docs/DONE_TEMPLATE.md`.
4. Create `docs/TEST_STRATEGY.md` with low-cost API test policy.
5. Create `docs/blueprint-master.md` and `docs/sprints.md`.
6. Review all docs for consistency with non-negotiable decisions.

## Acceptance criteria
1. All mandatory docs exist and are complete.
2. No contradiction with immutable MVP decisions.
3. Rules clearly constrain AI and automation behavior.
4. Test strategy explicitly requires mocks for external APIs.

## Out of scope
- Application feature implementation
- Clinical module implementation
- Billing implementation
- WhatsApp runtime integration

## Observations
- These documents remain the source of truth for later modules, including WhatsApp.
- Any future automation must continue to respect mock-first validation and low API cost.
