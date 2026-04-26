# Sprints Overview - OperaClinic

## Sprint 0 (Foundation and governance)
- Status: Delivered.
- Delivered:
- Project governance and immutable decisions.
- Blueprint, templates, and test strategy.
- Architecture boundaries locked: multi-tenant, backend-owned scheduling, billing separation.
- Initial backlog and acceptance model.

## Sprint 1 (Platform and identity baseline)
- Status: Delivered and reviewed on 2026-03-12.
- Delivered:
- Backend bootstrap in NestJS with modular structure and Prisma integration.
- JWT auth, refresh flow, current user context, base RBAC and tenant-aware auth boundaries.
- Platform and identity APIs for tenants, plans, subscriptions, users and role assignment.
- Web login/session flow, platform dashboard, tenants, plans and internal user management.
- Observations:
- Reception exists only as web shell/navigation foundation. The operational reception module is still pending.
- Automated tests are still checklist-based and smoke-driven.

## Sprint 2 (Aesthetic clinic structure baseline)
- Status: Delivered and reviewed on 2026-03-12.
- Delivered:
- Aesthetic clinic structure backend module with clinic profile, units, specialties, professionals and consultation types.
- Aesthetic clinic web screens for structure management with role-based edit/read behavior.
- Professional links to specialties and units, plus self-booking visibility flag.
- Observations:
- This sprint stabilized configuration data only. Reception workflows and scheduling UI were intentionally left out.

## Sprint 3 (Patients and scheduling core)
- Status: Delivered as backend operational baseline and reviewed on 2026-03-12.
- Delivered:
- Patients, patient contacts, list/search, create/update and find-or-merge flow.
- Scheduling core with professional schedules, schedule blocks, slot holds, appointments, status history and waitlist base.
- Audit and minimal operational logs for creation, reschedule and cancel flows.
- Stabilization notes from the final review:
- Patient search now supports phone and WhatsApp search without false AND filtering.
- Scheduling now validates professional-to-unit assignment consistently across availability, holds, appointments, schedules and blocks.
- Schedule blocks now respect active slot holds and buffered appointment occupancy.
- Appointment reschedule now clears stale hold linkage.
- Post-review hardening applied on 2026-04-04:
- Scheduling concurrency now uses serializable transactions plus tenant/professional advisory locks across holds, appointments, schedules and blocks.
- Realtime workspace and messaging channels now require authenticated tenant-scoped sessions.
- Remaining risks before WhatsApp:
- Scheduling still does not use tenant timezone as the scheduling engine source of truth.
- Reception web for patients, agenda and check-in is not implemented yet.

## Sprint 5 (Messaging foundations and Stripe integration)
- Status: Planned for 2026-03-23.
- Plan:
  - Stripe payment integration for aesthetic clinic onboarding (completed Session 8, pending escalation hotfix).
  - Messaging adapter foundations for WhatsApp: MockMessagingAdapter, MessagingAdapterFactory, ReceptionMessagingService.
  - Appointment confirmation via messaging (mock mode).
  - Webhook endpoint for inbound messages (structure; no provider integration yet).
  - Test coverage for messaging module (unit + integration, offline only).
- Goals:
  - ✅ Stripe: production-ready payment processing with mock-first development.
  - 🟡 Messaging: adapter pattern ready for Twilio/MessageBird in Sprint 6.
  - ✅ No autonomous messaging; all backend-triggered with handoff to human.
  - ✅ Multi-tenant message isolation enforced.
  - ✅ Mock messaging for testing without external APIs.
- Non-negotiables checked: All 12 rules + all architecture decisions validated in ARCHITECTURE_AUDIT.md, COMPLIANCE_SUMMARY.md, ARCHITECTURE_DECISIONS_IN_CODE.md.

## Sprint 5+ Roadmap (Future)
- **Sprint 6**: Real WhatsApp adapter completed on 2026-04-04; automatic reminders now have a minimal DB-driven 24h dispatch path with authenticated trigger, but mature cron/queue orchestration and broader follow-up cadences remain pending.
- **Sprint 7**: Professional lightweight app delivery.
- **Sprint 8**: Billing domain expansion + advanced aesthetic clinic operational modules.
