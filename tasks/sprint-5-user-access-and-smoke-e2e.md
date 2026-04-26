# Sprint 5 - User Access Management and Smoke E2E

## Status
- Delivered baseline on 2026-03-15.
- Source-of-truth task for the user access hardening sprint after Sprint 4 stabilization.

## Sprint goal
Deliver a real operational layer for clinic user management, harden password and session flows, and add minimum confidence around the critical access paths before the WhatsApp phase advances.

## Mandatory scope

### Block 1 - Clinic user management
- Allow clinic administration to:
  - list users
  - create users
  - edit users
  - deactivate users
  - reactivate users
  - adjust clinic roles
  - handle professionals with legacy or incomplete access linkage
- Keep tenant isolation explicit in every read and write path.
- Keep clinic admin as the only clinic actor allowed to manage users.

### Block 2 - Password and access hardening
- Implement:
  - own password change
  - password reset request
  - password reset by secure token
  - validation for active sessions after password reset
- Keep reset tokens backend-owned, time-bound, and non-recoverable in persistence.
- Avoid weak or UI-only permission assumptions.

### Block 3 - Minimum confidence coverage
- Cover the highest-risk paths with focused automated tests:
  - change password
  - request password reset
  - reset password
  - deactivate/reactivate
  - role updates
  - legacy professional linkage handling
  - session invalidation after password reset
- Keep the suite aligned with the existing mock-first test strategy.

## What enters this sprint
- Backend endpoints for user management and password flows.
- DTOs, validation, guards and audit coverage needed by those flows.
- Web flows required for clinic user administration and password management.
- Shared contracts already used by API and web for auth and user access.
- Minimal operational treatment for legacy professionals without correct user linkage.

## What does not enter this sprint
- WhatsApp implementation.
- Professional app delivery.
- Scheduling changes outside the minimum needed for legacy professional linkage.
- New clinical modules outside access and user management.
- Broad UI redesign unrelated to user access workflows.

## Definition of done
- Clinic user management works end-to-end in the web panel.
- Own password change works.
- Password reset request and reset by secure token work.
- User deactivate/reactivate works.
- Role updates work with backend-enforced permissions.
- Legacy professional linkage is handled coherently without inventing a new module.
- Active sessions are invalidated coherently after password reset.
- `shared build`, `api test`, `api typecheck`, `api build`, `web test`, `web typecheck`, and `web build` are green.
- Sprint documentation is updated with the implemented baseline.

## Key risks
- Breaking the current auth and session flow while adding reset logic.
- Allowing clinic actors to manage users outside their active tenant.
- Leaving reset tokens recoverable or too long-lived.
- Failing to invalidate active sessions after credential changes.
- Creating a frontend-only permission model that drifts from backend guards.
- Handling legacy professional linkage in a way that leaks into scheduling rules.

## Dependencies
- Sprint 0 governance documents remain authoritative.
- Sprint 1 auth, session, RBAC and identity baseline.
- Sprint 2 clinic structure for professional and tenant-linked roles.
- Sprint 4 stabilization baseline for reception, session DX and runtime hardening.
- Prisma schema and PostgreSQL-compatible migrations.
- `packages/shared` for shared auth and user contracts.

## Delivered baseline
- Clinic admin can list, create, edit, deactivate, reactivate and update clinic user roles.
- Password flows are split into:
  - own password change
  - password reset request
  - password reset by secure token
- Password change and password reset invalidate active sessions by `sessionVersion`.
- Legacy professional linkage is handled through user management without creating a parallel module.
- Clinic user management stays tenant-scoped and does not expose admin actions to reception or professional roles.

## Smoke E2E baseline
- Short HTTP smoke suite added on top of the existing web and API stack.
- Covered critical flows:
  - platform login
  - clinic login
  - reception create appointment
  - reception confirm appointment
  - reception check-in
  - reception cancel appointment
  - clinic/platform session isolation in the same browser
  - own password change
  - password reset
  - inactive/reactivated clinic user lifecycle
- Fixture support added through `prisma/seed-smoke-e2e.ts`.
- Execution path:
  - `pnpm --filter @operaclinic/api prisma:seed`
  - `pnpm --filter @operaclinic/api smoke:e2e:seed`
  - `pnpm --filter @operaclinic/web smoke:e2e`
- Suite remains intentionally short and does not introduce Playwright or another browser automation framework.

## Key implementation decisions
- Kept existing user status enum and treated `INACTIVE` and `SUSPENDED` as the current equivalents of disabled and blocked states.
- Kept reset token delivery backend-owned and non-recoverable in persistence by storing only a hash plus expiration.
- Exposed reset link preview only outside production to keep the flow testable before real delivery channels exist.
- Kept the professional workspace itself as product GAP, while making legacy professional access repair operational inside clinic user management.
- Kept smoke E2E at the HTTP route level through Next.js proxies to validate the real auth/session boundaries without inflating the test stack.
