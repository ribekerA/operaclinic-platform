# Sprint 2 - Clinic Structure Baseline

## Status
- Delivered and reviewed on 2026-03-12.

## Sprint goal
Implement the clinic configuration baseline needed before reception and WhatsApp workflows.

## Delivered
- Clinic profile management.
- Units, specialties, professionals and consultation types in backend.
- Tenant-aware validation for clinic structure entities.
- Web screens for clinic structure management in `apps/web`.
- Role-based edit/read behavior for tenant admin, clinic manager and reception.

## Residual observations
- This sprint does not include patients, agenda or reception operations.
- Clinic structure is stable as configuration baseline, but it is not the source of truth for appointment orchestration.
- Consultation type buffers now follow the operational limit used by scheduling.

## Out of scope
- WhatsApp runtime integration.
- Patient-facing application.
- Scheduling execution and appointment lifecycle UI.
