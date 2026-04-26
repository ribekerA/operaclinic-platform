# Architecture Decisions - OperaClinic

Status legend: Accepted | Proposed | Deprecated

## Decision register

### D-001 Multi-tenant baseline
- Status: Accepted
- Decision: OperaClinic is a multi-tenant SaaS platform for aesthetic clinics.
- Impact: Every module must carry tenant context and isolation while keeping the product language, onboarding and operation specific to aesthetic clinics.
- Migration notes: New copy, onboarding flows and governance docs must describe the product as exclusive to aesthetic clinics, not general clinics.

### D-002 Patient channel in MVP
- Status: Accepted
- Decision: Patient has no mobile app in MVP and interacts via WhatsApp.
- Impact: Product and APIs must prioritize conversational entrypoints, not patient app UI.

### D-003 Reception channel in MVP
- Status: Accepted
- Decision: Reception uses a web panel as the operational interface.
- Impact: Core operational flows start in `apps/web` and backend APIs.

### D-004 Professional channel in MVP
- Status: Accepted
- Decision: Professional uses a lightweight dedicated app in MVP scope.
- Impact: Backend contracts must support a future app client, even if not built now.

### D-005 Check-in ownership
- Status: Accepted
- Decision: Check-in belongs to reception workflows.
- Impact: Check-in logic and state transitions are designed under reception modules.

### D-006 Control plane
- Status: Accepted
- Decision: A super admin/control plane exists for platform-level governance.
- Impact: Platform administration is separated from aesthetic clinic operations.

### D-007 Schedule source of truth
- Status: Accepted
- Decision: Backend owns schedule and business rules.
- Impact: No schedule rule can be finalized in frontend or AI prompts.

### D-008 Baseline schedule model
- Status: Accepted
- Decision: Base schedule is organized by professional.
- Impact: Availability and slot generation start from professional configuration.

### D-009 Billing boundary
- Status: Accepted
- Decision: Billing is separated from aesthetic clinic operations.
- Impact: Billing domain, data, and workflows remain decoupled from care operations.

### D-010 AI role boundary
- Status: Accepted
- Decision: AI only interprets intent and triggers backend functions.
- Impact: AI does not execute hidden business logic or persist authoritative state directly.

### D-011 Greenfield starting point
- Status: Accepted
- Decision: The project starts from zero and must not assume legacy architecture.
- Impact: All conventions and modules are explicitly documented before implementation.

### D-012 Testability and cost policy
- Status: Accepted
- Decision: Development must support mock-driven tests and low API usage cost.
- Impact: External integrations require test doubles and budget-aware execution.

## Governance rules
1. New decisions must be added with sequential ID.
2. Any contradictory proposal must list affected decisions and migration path.
3. Accepted decisions are mandatory for prompts, coding, and reviews.
