# Test Strategy - OperaClinic

## Objective
Define a pragmatic quality strategy for a greenfield multi-tenant SaaS with controlled API cost.

## Test principles
1. Backend is authoritative for schedule and business rules.
2. Test critical rules close to backend domain boundaries.
3. Default to mock-first for external providers (WhatsApp, AI, billing gateways).
4. Keep CI deterministic and cost-aware.
5. Validate tenant isolation in every critical flow.

## Test layers

### 1. Unit tests (highest priority)
- Scope: domain rules, schedule calculations, validation policies, tenant guards.
- Requirement: run offline, no external APIs.
- Tooling direction: fast runner and lightweight fixtures.

### 2. Integration tests
- Scope: API + data layer + module boundaries.
- Requirement: isolated test environment with seeded tenants.
- Focus: check-in flow, scheduling flow, reception workflow continuity.

### 3. Contract tests
- Scope: interfaces between backend and clients/integrations.
- Requirement: explicit contracts for web panel, professional app, and AI function calls.
- Focus: backward compatibility for function signatures and payloads.

### 4. End-to-end smoke tests
- Scope: critical MVP paths only.
- Requirement: minimal suite for confidence, not broad UI coverage.
- Focus: reception actions and appointment lifecycle.

## Mocking policy
1. External APIs must have adapters and test doubles.
2. AI interactions are tested as function-call contracts, not free-form model behavior.
3. WhatsApp behavior is simulated in test environments.
4. Costly integrations are disabled by default in CI.

## Tenant validation checklist
1. Tenant context required in all relevant requests.
2. Cross-tenant data access is denied by default.
3. Logs and metrics preserve tenant attribution.

## Quality gates (minimum)
1. Unit tests passing for changed business rules.
2. Integration tests passing for changed module boundaries.
3. Contract tests updated when payloads/signatures change.
4. Evidence of mock coverage for any external dependency.

## Non-goals for current stage
1. Performance benchmarking at full production scale.
2. Exhaustive UI automation.
3. Full billing integration tests (billing remains separated and later-scoped).
