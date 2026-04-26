# OperaClinic Platform

OperaClinic is a multi-tenant SaaS platform for aesthetic clinic operations.

Current status: the core platform, reception, scheduling, observability, control plane, billing baseline and WhatsApp infrastructure are implemented. The project already runs end-to-end locally and supports staging validation, but pilot production still depends on real operational validation for WhatsApp, scheduling and reception.

## Product boundaries

- Patient has no app in MVP.
- Patient interaction in MVP will happen through WhatsApp.
- Reception of the aesthetic clinic operates through the web panel.
- Professional app stays out of scope for now.
- Check-in belongs to reception.
- Backend owns scheduling and business rules.
- Billing remains separated from aesthetic clinic operation.

## Monorepo structure

```text
operaclinic-platform/
  apps/
    api/
    web/
  packages/
    shared/
  docs/
  tasks/
  prompts/
    codex/
    copilot/
```

## Workspaces

- `apps/api`: NestJS backend with Prisma, auth, control plane, aesthetic clinic structure, patients, scheduling and reception baseline.
- `apps/web`: Next.js web panel with platform area, aesthetic clinic area and reception baseline. Build and typecheck scripts reset generated Next artifacts before execution for reproducible local runs.
- `packages/shared`: shared contracts used by backend and frontend for auth and reception payloads/responses focused on OperaClinic flows for aesthetic clinics.

## Implemented modules

### Backend
- Auth and base RBAC
- Platform and identity
- Aesthetic clinic structure
- Patients and patient contacts
- Scheduling core
- Reception baseline
- Messaging threads, handoff and Meta WhatsApp adapter baseline
- Platform command center, readiness and operational KPI snapshots
- Minimal async follow-up and agent observability baseline
- Audit log

### Web
- Platform login and dashboard
- Aesthetic clinic login and dashboard
- Tenants, plans and aesthetic clinic user management
- Aesthetic clinic structure screens
- Reception dashboard, day agenda, appointment drawer and manual booking flow
- Command center modules for overview, operations, finance, agents, reliability and product control

## Still partial or pending

- Real WhatsApp rollout validated with provider in field operation
- Real professional experience on web/app
- Full deployment automation and infrastructure-as-code
- Complete aesthetic treatment journey domain
- Final production UI polish for all flows

## Unified runbook

For the practical sequence to bootstrap locally, validate end-to-end, publish to staging and prepare production rollout, use:

- [docs/LOCAL_TO_PRODUCTION_RUNBOOK.md](docs/LOCAL_TO_PRODUCTION_RUNBOOK.md)

## Local setup

1. Copy `.env.example` to `.env` and fill real secrets.
   `NEXT_PUBLIC_API_BASE_URL` is required by the web session proxy, has no runtime fallback and must use `https` in production.
   `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` must be different; production rejects placeholder or short values.
2. Install dependencies:
   - `pnpm install`
3. Generate Prisma client:
   - `pnpm --filter @operaclinic/api prisma:generate`
4. Run migrations:
   - `pnpm --filter @operaclinic/api prisma:migrate:deploy`
5. Seed the baseline data:
   - `pnpm --filter @operaclinic/api prisma:seed`
   Set `SEED_SUPER_ADMIN_PASSWORD` or `SEED_SUPER_ADMIN_PASSWORD_HASH` before running the seed.

## Main commands

- Development:
  - `pnpm dev`
- Build:
  - `pnpm build`
- Typecheck:
  - `pnpm typecheck`
- Tests:
  - `pnpm test`

### Per app

- Backend dev:
  - `pnpm --filter @operaclinic/api dev`
- Web dev:
  - `pnpm --filter @operaclinic/web dev`
- Backend tests:
  - `pnpm --filter @operaclinic/api test`

## Quality gate before WhatsApp

1. `pnpm --filter @operaclinic/shared build`
2. `pnpm --filter @operaclinic/api test`
3. `pnpm --filter @operaclinic/api typecheck`
4. `pnpm --filter @operaclinic/api build`
5. `pnpm --filter @operaclinic/web typecheck`
6. `pnpm --filter @operaclinic/web build`

## Smoke E2E

This project now has a short smoke E2E suite for the critical live flows:

- platform login
- clinic login
- reception create, confirm, check-in and cancel
- clinic/platform session isolation in the same browser
- own password change
- password reset
- inactive/reactivated clinic user

### Preconditions

- PostgreSQL is up and reachable by `apps/api`.
- `apps/api/.env` or equivalent runtime env is configured.
- `SEED_SUPER_ADMIN_PASSWORD` must match the smoke expectation.
  Default smoke credential: `ChangeMe123!`
- API is running on `http://localhost:3001`
- Web is running on `http://localhost:3000`

### Run

1. Start the API and web locally.
2. Prepare the baseline seed and the smoke fixture:
   - `pnpm --filter @operaclinic/api prisma:seed`
   - `pnpm --filter @operaclinic/api smoke:e2e:seed`
3. Run the smoke suite:
   - `pnpm --filter @operaclinic/web smoke:e2e`

Or run the full shortcut from the repo root:

- `pnpm smoke:e2e`

### Notes

- The suite is intentionally HTTP-based through the real Next.js routes and backend API. It is not a browser UI automation suite.
- The smoke fixture creates dedicated users and aesthetic-clinic resources with the `Smoke E2E` prefix.
- The same-day check-in smoke depends on at least one remaining future slot on the aesthetic clinic local day.
- The same smoke suite can be pointed to staging by setting `SMOKE_E2E_WEB_BASE_URL`.

## Internal-only scope notes

- `tenant_features` stays as internal persistence support only. It is present in schema/migrations, but it is not exposed as visible UI, public API or runtime gating surface in the current phase.
- Reception is the operational entrypoint for check-in, confirmation and manual appointment handling.
- Scheduling remains backend-owned and must stay isolated from future WhatsApp orchestration.
