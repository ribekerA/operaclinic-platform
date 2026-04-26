# Sprint 1 - Technical Baseline

## Status
- Delivered and stabilized on 2026-03-12.

## Sprint goal
Establish platform and identity foundations without breaking architecture boundaries.

## Delivered
- Backend bootstrap in `apps/api` with NestJS modular structure.
- Prisma baseline, initial data model, migrations and seed.
- JWT auth with access token, refresh token, `/auth/login`, `/auth/refresh` and `/auth/me`.
- Base RBAC and tenant-aware authorization for super admin, platform admin and clinic roles.
- Platform module for tenants, plans, subscriptions and tenant settings.
- Identity module for users, roles and user-role assignment.
- Web login/session flow in `apps/web`.
- Platform shell and screens for dashboard, tenants, plans and clinic users.

## Architecture checks
1. Backend remains owner of schedule and business rules.
2. Billing remains outside clinical operation.
3. Patient app was not introduced in MVP scope.
4. Platform users and clinic users remain distinct in auth context.

## Residual observations
- Reception is still a shell/navigation concern only. Operational reception screens are pending.
- Automated tests are still pending; current validation relies on smoke checks and build/typecheck gates.
- `packages/shared` exists but is not populated with cross-app contracts yet.

## Out of scope
- Final UI design
- Full production integrations
- Advanced clinical workflows
- Billing product implementation
