# Sprint 4 - Stabilization and Reception Baseline

## Status
- Delivered on 2026-03-13.
- Source-of-truth task for the stabilization sprint before the WhatsApp phase.

## Sprint goal
Prepare OperaClinic for the next phase by stabilizing the scheduling core, delivering a minimal operational reception flow, adding risk-focused automated tests, and removing technical shortcuts that should not cross into the WhatsApp phase.

## Mandatory scope

### Block 1 - Scheduling hardening
- Keep `tenant.timezone` as the source of truth for schedule day resolution.
- Ensure availability search is calculated from tenant-local day boundaries.
- Harden appointment create with concurrency protection.
- Harden appointment reschedule with concurrency protection.
- Preserve appointment history on cancel without deleting appointments.
- Review `slot_holds` behavior around stale holds, active conflicts and hold consumption.
- Reinforce `idempotency_key` behavior for appointment create.
- Preserve appointment status history invariants for all supported transitions.

### Block 2 - Reception baseline
- Backend:
- Close the `reception` module with:
  - `GET /api/v1/reception/dashboard`
  - `PATCH /api/v1/reception/appointments/:appointmentId/confirm`
  - `PATCH /api/v1/reception/appointments/:appointmentId/check-in`
  - `PATCH /api/v1/reception/appointments/:appointmentId/no-show`
  - `PATCH /api/v1/reception/appointments/:appointmentId/status`
- Frontend web:
- Deliver the minimum operational reception surface:
  - reception dashboard
  - day agenda
  - appointment drawer
  - manual appointment creation
  - confirmations view
  - check-in / queue view
  - real patient search for operation
- Reception must be able to:
  - find patient
  - create manual appointment
  - reschedule
  - cancel
  - confirm
  - check-in
  - mark no-show
- Agenda rows must expose quick actions for:
  - confirm
  - check-in
  - reschedule
  - cancel

### Block 3 - Minimum automated tests
- Cover:
  - login
  - refresh
  - `/auth/me`
  - tenant isolation
  - create tenant smoke
  - patients find-or-merge
  - availability search
  - appointment create
  - appointment conflict
  - appointment reschedule
  - appointment cancel
  - relevant timezone boundary
  - basic status history invariant
- Keep the suite focused on operational risk.
- Reuse the existing project testing pattern and tooling.

### Block 4 - DX / Security cleanup
- Keep web build reproducible.
- Update `.env.example` to the actual runtime requirements.
- Update `README.md` to the current operational baseline.
- Remove unsafe production fallbacks still present in runtime code.
- Keep `packages/shared` limited to contracts already used across apps.
- Keep `tenant_features` internal-only for now unless the code audit requires a narrower visible scope.

## Non-negotiable rules
- Backend remains the owner of scheduling rules and schedule state.
- Base scheduling remains professional-centric.
- Appointments are never deleted.
- Every supported status change must continue generating status history.
- Do not introduce architecture outside `docs/blueprint-master.md`.
- If needed, use PostgreSQL-safe transaction and locking patterns coherent with Prisma.
- Do not start WhatsApp in this sprint.
- Do not implement patient app, professional app, or advanced billing here.

## Definition of done

### Scheduling
- Availability and same-day checks resolve the tenant-local date from `tenant.timezone`.
- Appointment create and reschedule are protected against conflicting concurrent writes.
- Cancel preserves the appointment row and writes history.
- Slot holds do not block valid bookings after expiration and do not bypass conflict rules.
- Repeated create requests with the same tenant/idempotency key remain deterministic.
- Status history remains append-only for supported appointment transitions.

### Reception
- Reception API exposes the mandatory endpoints and keeps check-in under reception ownership.
- Reception UI supports the minimum operational flow on desktop-first layout.
- Agenda rows expose operational quick actions without moving schedule rules to the frontend.
- Appointment detail remains available through a lateral drawer when operationally useful.

### Tests and DX
- The minimum risk-focused automated coverage exists for auth, tenant isolation, patients and scheduling.
- `README.md` and `.env.example` match the implemented runtime.
- Web build/typecheck flow remains reproducible without relying on stale output directories.
- Unsafe runtime defaults that could leak into production are removed.

## Dependencies
- Sprint 0 governance documents remain authoritative.
- Sprint 1 auth, session, RBAC and control plane baseline.
- Sprint 2 clinic structure baseline for units, specialties, professionals and consultation types.
- Sprint 3 patients and scheduling core.
- Prisma schema and PostgreSQL-compatible migrations.
- `packages/shared` for backend/frontend contract sharing.

## Key risks to manage during execution
- Hidden timezone regressions around local-day boundaries and same-day reception actions.
- Booking races under concurrent create/reschedule attempts.
- UI shortcuts that accidentally move scheduling rules to the frontend.
- Incomplete status-history coverage when adding reception transitions.
- Web runtime depending on implicit environment fallbacks.

## Out of scope
- WhatsApp implementation or adapter start.
- Professional app delivery.
- Advanced billing workflows.
- New product surfaces outside reception baseline and scheduling stabilization.

## Validation checklist before starting WhatsApp later
1. Backend scheduling uses tenant-local day context consistently.
2. Reception can search patient, create, reschedule, cancel, confirm, check-in and no-show from the web panel.
3. Appointments remain immutable in persistence and keep status history.
4. Minimum automated coverage for auth, tenant isolation, patients and scheduling is green.
5. Shared contracts used by both apps are centralized in `packages/shared`.
6. Runtime documentation and environment examples match the real setup.
7. `tenant_features` remains internal-only and is not exposed as visible product scope.
8. No WhatsApp logic owns schedule decisions or appointment state.

## Validation run on 2026-03-13
1. `pnpm --filter @operaclinic/shared build`
2. `pnpm --filter @operaclinic/api test`
3. `pnpm --filter @operaclinic/api typecheck`
4. `pnpm --filter @operaclinic/api build`
5. `pnpm --filter @operaclinic/web typecheck`
6. `pnpm --filter @operaclinic/web build`
