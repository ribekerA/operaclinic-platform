# Sprint 3 - Patients and Scheduling Core

## Status
- Delivered as backend baseline and stabilized by Sprint 4 on 2026-03-12.

## Sprint goal
Implement the operational core for patients and professional-based scheduling.

## Delivered
- Patients and patient contacts.
- Patient search, create, update and find-or-merge flow.
- Professional schedules and schedule blocks.
- Availability search and slot holds.
- Appointments, cancel/reschedule flow and appointment status history.
- Waitlist base and audit/log coverage for key actions.

## Stabilization notes
- Patient search now matches phone and WhatsApp values correctly.
- Scheduling now validates professional-to-unit assignment before schedule, block, hold, availability and appointment operations.
- Schedule blocks now reject overlap with active holds and buffered appointment occupancy.
- Appointment reschedule now clears stale `slotHoldId`.
- Scheduling now resolves tenant-local day boundaries through `tenant.timezone`.
- Reception baseline is now the operational consumer of appointment lifecycle actions.

## Open risks
- Parallel booking races still require validation under production-like load, even with transaction-level locking in place.
- Automated coverage is still minimal and focused on core invariants, not full integration breadth.
- WhatsApp orchestration is still pending and must not bypass reception and scheduling boundaries.

## Out of scope
- WhatsApp integration.
- Check-in workflow implementation.
- Billing integration.
