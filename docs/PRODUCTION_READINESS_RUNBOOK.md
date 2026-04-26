# Production Readiness Runbook

## Objective

Consolidate the production checks that now exist in code for:

- scheduling safety
- realtime channel safety
- operational flow observability
- Stripe checkout readiness
- Meta WhatsApp readiness
- platform control plane visibility

This runbook is the operational reference for Sprint 1 hardening.

## Shipped Signals

The current code already exposes these signals:

- API health: `GET /api/v1/health`
- API readiness: `GET /api/v1/health/readiness`
- platform control plane: `/platform`
- structured operational logs for HTTP and realtime flows

Current readiness checks cover:

- database connectivity and latency
- rolling operational metrics in `checks.operations`
- agent rollout, failure rate and p95 latency in `checks.agent`
- payment provider mode (`mock` or `stripe`)
- Stripe webhook configuration
- Meta WhatsApp environment enablement
- active Meta connections in database
- active Meta connections missing `externalAccountId` / phone number id

Notes:

- `checks.operations` is currently the backend source of truth for per-flow metrics. The platform dashboard does not yet expose this breakdown.
- Realtime namespaces now reject unauthenticated or scope-mismatched connections before joining tenant rooms.

## Relevant Files

- [health.service.ts](C:/Users/byimp/OneDrive/Documentos/GitHub/operaclinic-platform/apps/api/src/modules/health/health.service.ts)
- [operational-observability.service.ts](C:/Users/byimp/OneDrive/Documentos/GitHub/operaclinic-platform/apps/api/src/common/observability/operational-observability.service.ts)
- [request-logging.interceptor.ts](C:/Users/byimp/OneDrive/Documentos/GitHub/operaclinic-platform/apps/api/src/common/interceptors/request-logging.interceptor.ts)
- [realtime-auth.service.ts](C:/Users/byimp/OneDrive/Documentos/GitHub/operaclinic-platform/apps/api/src/auth/realtime-auth.service.ts)
- [professional-workspace.gateway.ts](C:/Users/byimp/OneDrive/Documentos/GitHub/operaclinic-platform/apps/api/src/modules/scheduling/gateways/professional-workspace.gateway.ts)
- [messaging.gateway.ts](C:/Users/byimp/OneDrive/Documentos/GitHub/operaclinic-platform/apps/api/src/modules/messaging/gateways/messaging.gateway.ts)
- [platform-dashboard.service.ts](C:/Users/byimp/OneDrive/Documentos/GitHub/operaclinic-platform/apps/api/src/modules/platform/platform-dashboard.service.ts)
- [platform.ts](C:/Users/byimp/OneDrive/Documentos/GitHub/operaclinic-platform/packages/shared/src/platform.ts)
- [page.tsx](C:/Users/byimp/OneDrive/Documentos/GitHub/operaclinic-platform/apps/web/app/(platform)/platform/page.tsx)
- [env.validation.ts](C:/Users/byimp/OneDrive/Documentos/GitHub/operaclinic-platform/apps/api/src/config/env.validation.ts)
- [STRIPE_SETUP.md](C:/Users/byimp/OneDrive/Documentos/GitHub/operaclinic-platform/docs/STRIPE_SETUP.md)

## Required Environment

### Stripe

Use these variables when real billing is expected:

```bash
PAYMENT_PROVIDER=stripe
STRIPE_SECRET_KEY=sk_live_or_test
STRIPE_WEBHOOK_SECRET=whsec_live_or_test
WEB_URL=https://your-web-domain
```

Rules already enforced in code:

- production cannot use `PAYMENT_PROVIDER=mock`
- Stripe mode requires `STRIPE_SECRET_KEY`
- Stripe mode requires `STRIPE_WEBHOOK_SECRET`
- `WEB_URL` must be an absolute HTTP(S) URL and is also used as the allowed origin for realtime CORS

### Meta WhatsApp

Use these variables when real WhatsApp is expected:

```bash
MESSAGING_WHATSAPP_META_ENABLED=true
MESSAGING_WHATSAPP_META_API_BASE_URL=https://graph.facebook.com
MESSAGING_WHATSAPP_META_API_VERSION=v21.0
MESSAGING_WHATSAPP_META_ACCESS_TOKEN=meta_token
MESSAGING_WHATSAPP_META_APP_SECRET=meta_app_secret
```

Database-side operational requirement:

- at least one active `WHATSAPP_META` integration connection
- every active Meta connection must have `externalAccountId` filled with the phone number id

### Realtime Channel Access

Current realtime namespaces are:

- `/professional-workspace`
- `/messaging`

Rules already enforced in code:

- every websocket connection must authenticate with a valid access session before joining rooms
- tenant scope requested in the handshake cannot differ from the authenticated active tenant
- professional workspace scope must match the authenticated linked professional
- browser clients depend on cookie forwarding to the API origin; mobile professional clients send `Authorization: Bearer <access-token>`

## Scheduling Safety Already Applied

The hardening already implemented in code includes:

- database time as source of truth for critical scheduling comparisons
- consistent current instant usage for holds, appointments, reception and insights
- serializable transactions for write-side scheduling mutations
- tenant/professional advisory locks shared across holds, appointments, schedules and blocks
- explicit ISO datetime with offset for scheduling block input

This reduces:

- app server clock skew
- stale hold inconsistencies
- concurrent double-booking and overlapping schedule mutation windows
- ambiguous datetime parsing

## Operational Observability Already Applied

The hardening already implemented in code includes:

- request-level structured logs with `traceId`, tenant attribution, flow name, status code and latency
- realtime connection and emit logs with accepted, rejected and failure outcomes
- rolling in-memory metrics by flow in `checks.operations.metrics`

Use these signals to inspect:

- repeated `conflict` outcomes in scheduling write flows
- repeated `rejected` outcomes on realtime connection flows
- rising p95 latency on critical HTTP or realtime flows

## Status Semantics

### `ok`

Use this when the dependency is operationally ready.

Examples:

- database query succeeds
- Stripe mode is active with webhook configured
- Meta is enabled and active connections are complete

### `degraded`

Use this when the system still runs, but is not production-ready.

Examples:

- payment provider is still `mock`
- Meta is disabled in environment
- no active Meta connections exist yet

### `error`

Use this when rollout should stop until fixed.

Examples:

- database connectivity failed
- Stripe mode selected without secret or webhook secret
- production environment with mock payment
- Meta enabled without token or app secret

## Go-Live Checklist

Before calling the platform production-ready, verify:

- `GET /api/v1/health/readiness` returns no `error`
- `/platform` shows no critical operational blockers
- `PAYMENT_PROVIDER=stripe`
- `STRIPE_SECRET_KEY` is configured
- `STRIPE_WEBHOOK_SECRET` is configured
- Stripe webhook endpoint is reachable
- `MESSAGING_WHATSAPP_META_ENABLED=true` if WhatsApp rollout is in scope
- at least one active Meta connection exists
- every active Meta connection has `externalAccountId`
- no stale operational blockers remain in the platform dashboard

## Incident Triage

### If readiness reports payment `degraded`

Check:

- whether billing is still in `mock`
- whether rollout intentionally stayed in development mode
- whether `COMMERCIAL_ONBOARDING_ENABLE_MOCK_CHECKOUT` is still enabled

Action:

- move provider to Stripe
- configure webhook secret
- re-run readiness

### If readiness reports payment `error`

Check:

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `PAYMENT_PROVIDER`
- `WEB_URL`

Action:

- correct env
- restart API
- validate `GET /api/v1/health/readiness`

### If readiness reports messaging `degraded`

Check:

- whether Meta rollout is intentionally disabled
- active Meta connection count
- connection completeness in `integration_connections`

Action:

- enable Meta at env level if rollout is expected
- create or fix active Meta connection
- ensure `externalAccountId` is present

### If readiness reports messaging `error`

Check:

- `MESSAGING_WHATSAPP_META_ACCESS_TOKEN`
- `MESSAGING_WHATSAPP_META_APP_SECRET`

Action:

- correct env
- restart API
- validate readiness again

### If readiness reports database `error`

Check:

- database connectivity
- Prisma connection string
- infrastructure/network reachability

Action:

- restore DB connectivity first
- do not continue rollout while database readiness is red

## Operator Workflow

1. Open `/platform`.
2. Review `Readiness operacional`.
3. Review `Riscos imediatos`.
4. Execute items from `Checklist executivo`.
5. Re-run `Atualizar leitura`.
6. Confirm that readiness no longer shows blockers.

## Current Sprint 1 Closure

Sprint 1 can be considered operationally documented because the project now has:

- backend readiness endpoint
- platform readiness visibility
- actionable control-plane checklist
- environment validation for Stripe and Meta
- runbook for rollout and incident triage

The remaining Sprint 1 gaps are not documentation gaps anymore. They are rollout validation gaps:

- real Stripe production validation
- real Meta WhatsApp production validation
- any residual concurrency edge cases that only appear under real load
