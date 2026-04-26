# Local to Production Runbook

## Objective

Provide one operational sequence for:

- local bootstrap
- full validation of the current monorepo
- staging deployment
- production preparation
- controlled rollout of Stripe, agents and WhatsApp

This runbook is intentionally pragmatic. It does not assume Docker, CI deploy automation or infrastructure-as-code because those are not present in the repository today.

## Current truth

The repository is ready to:

- run locally end-to-end
- pass backend and web quality gates
- execute smoke E2E for the critical core flows
- be published to staging

The repository is not yet automatically ready for a real clinic pilot without extra operational proof. The remaining pilot blockers are documented in:

- [PILOT_READINESS_PLAN.md](C:/Users/byimp/OneDrive/Documentos/GitHub/operaclinic-platform/docs/PILOT_READINESS_PLAN.md)
- [PROJECT_COMPLETION_CHECKLIST.md](C:/Users/byimp/OneDrive/Documentos/GitHub/operaclinic-platform/docs/PROJECT_COMPLETION_CHECKLIST.md)

Important distinction:

- technical deployment readiness is not the same as pilot Go
- staging Go is not the same as production Go
- production Go is not the same as WhatsApp pilot Go

## Topology

Current runtime topology expected by the repo:

1. PostgreSQL
2. API service (`apps/api`)
3. Web service (`apps/web`)

Optional external integrations:

- Stripe
- Meta WhatsApp

## Required environment variables

Minimum variables to run the core locally:

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/operaclinic?schema=public
JWT_ACCESS_SECRET=<strong secret>
JWT_REFRESH_SECRET=<different strong secret>
NEXT_PUBLIC_API_BASE_URL=http://localhost:3001/api/v1
WEB_URL=http://localhost:3000
SEED_SUPER_ADMIN_PASSWORD=ChangeMe123!
```

If Stripe is enabled:

```bash
PAYMENT_PROVIDER=stripe
STRIPE_SECRET_KEY=sk_test_or_live_xxx
STRIPE_WEBHOOK_SECRET=whsec_test_or_live_xxx
```

If Meta WhatsApp is enabled:

```bash
MESSAGING_WHATSAPP_META_ENABLED=true
MESSAGING_WHATSAPP_META_API_BASE_URL=https://graph.facebook.com
MESSAGING_WHATSAPP_META_API_VERSION=v21.0
MESSAGING_WHATSAPP_META_ACCESS_TOKEN=<token>
MESSAGING_WHATSAPP_META_APP_SECRET=<app_secret>
```

Reference files:

- [../.env.example](C:/Users/byimp/OneDrive/Documentos/GitHub/operaclinic-platform/.env.example)
- [../apps/api/.env.example](C:/Users/byimp/OneDrive/Documentos/GitHub/operaclinic-platform/apps/api/.env.example)
- [../apps/web/.env.example](C:/Users/byimp/OneDrive/Documentos/GitHub/operaclinic-platform/apps/web/.env.example)
- [../apps/api/src/config/env.validation.ts](C:/Users/byimp/OneDrive/Documentos/GitHub/operaclinic-platform/apps/api/src/config/env.validation.ts)

## Phase 1 - Local bootstrap

### 1. Install dependencies

```powershell
pnpm install
```

### 2. Generate Prisma client

```powershell
pnpm --filter @operaclinic/api prisma:generate
```

### 3. Apply migrations

```powershell
pnpm --filter @operaclinic/api prisma:migrate:deploy
```

### 4. Seed the base data

```powershell
pnpm --filter @operaclinic/api prisma:seed
```

### 5. Start the API

Use the safe startup wrapper first:

```powershell
pnpm start:dev
```

It checks `GET /api/v1/health/readiness` before trying to start a second API process.

### 6. Start the web

In another terminal:

```powershell
pnpm --filter @operaclinic/web dev
```

### 7. Validate readiness

```powershell
pnpm api:ready:check
pnpm api:ready:strict
```

Expected local URLs:

- Web: `http://localhost:3000`
- API: `http://localhost:3001`
- API readiness: `http://localhost:3001/api/v1/health/readiness`

## Phase 2 - Full validation before any deploy

Run the quality gate in this order:

```powershell
pnpm --filter @operaclinic/shared build
pnpm --filter @operaclinic/api test
pnpm --filter @operaclinic/api typecheck
pnpm --filter @operaclinic/api build
pnpm --filter @operaclinic/web test
pnpm --filter @operaclinic/web typecheck
pnpm --filter @operaclinic/web build
```

If you want the full monorepo gate:

```powershell
pnpm typecheck
pnpm test
pnpm build
```

## Phase 3 - Smoke E2E of the critical core flows

The smoke suite validates:

- platform login
- clinic login
- reception create appointment
- confirm
- check-in
- cancel
- clinic/platform session isolation
- password change
- password reset
- user reactivation

### 1. Prepare smoke fixture

```powershell
pnpm --filter @operaclinic/api prisma:seed
pnpm --filter @operaclinic/api smoke:e2e:seed
```

### 2. Run smoke

```powershell
pnpm --filter @operaclinic/web smoke:e2e
```

Or from the root:

```powershell
pnpm smoke:e2e
```

### 3. Reuse smoke against staging

The smoke helper can target a remote web base URL:

```powershell
$env:SMOKE_E2E_WEB_BASE_URL="https://your-staging-web-domain"
pnpm --filter @operaclinic/web smoke:e2e
```

This is useful after staging deploy because it validates the same HTTP session flows without inventing a second test strategy.

## Phase 4 - Manual end-to-end validation

Automation is not enough. Run this manual sequence every time before staging sign-off:

1. `platform login`
2. validate `/platform`
3. validate `/platform/reliability`
4. validate `/platform/operations`
5. `clinic login`
6. open reception dashboard
7. search availability
8. create appointment
9. confirm appointment
10. reschedule appointment
11. cancel appointment
12. create a new appointment
13. check-in appointment
14. mark no-show on a separate appointment when applicable
15. validate operational KPIs on the clinic and platform surfaces
16. validate tenant isolation with platform and clinic sessions in parallel
17. validate auditability through recent activity and logs

If billing is in scope:

18. execute a Stripe checkout in test mode
19. confirm webhook delivery
20. finalize onboarding and confirm tenant activation

If WhatsApp is in scope:

21. do not jump directly to production clinic traffic
22. follow the dedicated order `2 -> 3 -> 1`

Reference docs:

- [STRIPE_SETUP.md](C:/Users/byimp/OneDrive/Documentos/GitHub/operaclinic-platform/docs/STRIPE_SETUP.md)
- [WHATSAPP_EXECUTION_2_3_1_RUNBOOK.md](C:/Users/byimp/OneDrive/Documentos/GitHub/operaclinic-platform/docs/WHATSAPP_EXECUTION_2_3_1_RUNBOOK.md)
- [WHATSAPP_ONE_PAGER_EXECUTIVO.md](C:/Users/byimp/OneDrive/Documentos/GitHub/operaclinic-platform/docs/WHATSAPP_ONE_PAGER_EXECUTIVO.md)

## Phase 5 - Staging deployment

There is no deployment pipeline in the repository today. Use a manual deployment process.

### Recommended order

1. provision managed PostgreSQL
2. create API environment variables
3. create web environment variables
4. install dependencies on the target runtime
5. build the monorepo
6. run `prisma:migrate:deploy`
7. run seed only if the environment is empty and intended to have demo/bootstrap data
8. start API
9. start web
10. validate readiness
11. run smoke against staging

### Example staging command sequence

```powershell
pnpm install --frozen-lockfile
pnpm build
pnpm --filter @operaclinic/api prisma:migrate:deploy
pnpm --filter @operaclinic/api start:prod
pnpm --filter @operaclinic/web start
```

### Staging environment rules

- `NODE_ENV=production`
- `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` must be strong and different
- `WEB_URL` must be the real staging web URL
- `NEXT_PUBLIC_API_BASE_URL` must point to the real staging API prefix
- if Stripe is enabled, webhook secret must be configured
- if Meta is enabled, token and app secret must be configured

### Staging validation gate

Do not advance from staging until all are true:

1. `pnpm api:ready:strict` or equivalent remote readiness check passes
2. `/platform` shows no critical blocker for the intended scope
3. smoke E2E passes against staging
4. manual reception flow passes
5. audit trail and operational logs are visible

## Phase 6 - Stripe rollout

Use Stripe in staging before production.

### Local or staging preparation

1. configure `STRIPE_SECRET_KEY`
2. configure `STRIPE_WEBHOOK_SECRET`
3. set `PAYMENT_PROVIDER=stripe`

### Local webhook forwarding

```powershell
stripe listen --forward-to localhost:3001/api/v1/commercial/webhook/payment
```

### Staging/production checklist

1. webhook endpoint publicly reachable
2. webhook signing secret correct
3. test payment succeeds
4. webhook is delivered and accepted
5. onboarding leaves `AWAITING_PAYMENT` and reaches completion

Reference:

- [STRIPE_SETUP.md](C:/Users/byimp/OneDrive/Documentos/GitHub/operaclinic-platform/docs/STRIPE_SETUP.md)

## Phase 7 - Agent layer rollout

Do not turn agents to 100% immediately.

Recommended path:

1. `AGENT_LAYER_ENABLED=true`
2. `AGENT_LAYER_ROLLOUT_PERCENTAGE=5`
3. observe one full operational window
4. evaluate failure rate and p95
5. only then move to 25, 50, 75, 100

Useful commands:

```powershell
pnpm agent:gate:run:local
```

For staging, use the full gate script with a real base URL and validation document, following:

- [AGENT_LAYER_ROLLOUT_RUNBOOK.md](C:/Users/byimp/OneDrive/Documentos/GitHub/operaclinic-platform/docs/AGENT_LAYER_ROLLOUT_RUNBOOK.md)

## Phase 8 - WhatsApp rollout

WhatsApp must follow the official order below:

1. technical setup by clinic
2. operational governance and rollback gate
3. real field validation

Do not skip straight to production traffic.

### Minimal WhatsApp rollout sequence

1. enable Meta environment variables
2. publish API endpoint for webhook
3. create active integration connection for the tenant
4. validate readiness without messaging credential errors
5. validate inbound and outbound test events
6. define SLA, handoff and rollback owner
7. run a controlled pilot window
8. decide `GO`, `HOLD` or `NO-GO`

Reference:

- [WHATSAPP_EXECUTION_2_3_1_RUNBOOK.md](C:/Users/byimp/OneDrive/Documentos/GitHub/operaclinic-platform/docs/WHATSAPP_EXECUTION_2_3_1_RUNBOOK.md)
- [WHATSAPP_ONE_PAGER_EXECUTIVO.md](C:/Users/byimp/OneDrive/Documentos/GitHub/operaclinic-platform/docs/WHATSAPP_ONE_PAGER_EXECUTIVO.md)

## Phase 9 - Production go-live

Production should only happen after staging sign-off.

### Production checklist

1. `pnpm build` passes on the release commit
2. API and web production env variables are present
3. `prisma:migrate:deploy` succeeds
4. readiness returns no `error`
5. Stripe webhook is configured if billing is in scope
6. Meta connection is configured if WhatsApp is in scope
7. smoke passes against the production-like target you are about to expose
8. rollback owner is defined
9. log observation window is planned

### Recommended production sequence

1. backup database
2. deploy API
3. validate API readiness
4. deploy web
5. validate `/platform`
6. validate smoke or reduced production-safe check
7. only then expose the tenant/traffic

## Rollback

### API or web deploy rollback

1. restore previous application version
2. keep database at the last safe schema level if compatible
3. validate readiness again
4. confirm login and reception flow

### Agent rollback

Fast kill switch:

```bash
AGENT_LAYER_ENABLED=false
```

Partial rollback:

```bash
AGENT_LAYER_ROLLOUT_PERCENTAGE=0
```

### WhatsApp rollback

1. stop pilot escalation
2. keep human handoff active
3. disable automation if needed
4. preserve inbound capture and audit trail
5. reopen gate only after cause analysis

## What this runbook does not solve

This runbook gets the project running, validated and deployable.

It does not remove the current pilot blockers already documented:

- real WhatsApp validation with provider
- scheduling proof under real timezone and contention
- reception UAT without founder dependency
- onboarding proven within the target SLA

That means:

- yes, you can run the project now
- yes, you can validate the full core flow now
- yes, you can publish to staging now
- production clinic operation still requires the remaining pilot gates

## Recommended practical sequence

Use this exact order:

1. local bootstrap
2. local tests and smoke
3. manual end-to-end validation
4. staging deploy
5. staging smoke
6. staging billing validation
7. agent 5% gate if in scope
8. WhatsApp `2 -> 3 -> 1` if in scope
9. production deployment
10. pilot Go or No-Go decision
