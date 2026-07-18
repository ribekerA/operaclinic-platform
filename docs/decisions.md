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

### D-013 Commercial plan matrix — WhatsApp/IA in all plans, differentiation by volume and management depth
- Status: Accepted
- Decision: The Brazilian aesthetic-clinic management-software market is a commodity (vertical competitors charge R$39–99/month with agenda, anamnesis and WhatsApp reminders included). OperaClinic does not compete as a management system; its competitive differentiator is the AI agent layer on WhatsApp (autonomous lead captation and scheduling). Therefore: (1) WhatsApp channel, AI captation agent, AI scheduling agent, and automatic appointment reminders are present in ALL plans, including the entry plan (`ESTETICA_START`). (2) Plan differentiation moves to volume (monthly AI-handled conversations, number of professionals, number of units) and management depth (waitlist, schedule override, message templates, operational KPIs, executive dashboard, procedure protocols, multi-unit). This supersedes the previous matrix in `packages/shared/src/plan-features.ts`, which reserved WhatsApp/AI for higher tiers.
- Impact: `packages/shared/src/plan-features.ts` is the typed source of truth for the new matrix; `packages/shared/src/commercial.ts` (public marketing catalog, consumed by onboarding/checkout) must stay consistent with it. Quantitative limits (`maxProfessionals`, `maxUnits`, `monthlyAiConversations`) are modeled as data (`number | null`), not booleans, so they can be overridden per tenant without a boolean explosion. Runtime enforcement (guards, usage counters, graceful degradation to human handoff on limit) is tracked as a separate follow-up (Phase 2 of the gating rollout) and is not yet wired into the backend as of this decision.
- Migration notes: Existing tenants on `ESTETICA_START` gain WhatsApp/AI access as part of this change (additive, no removal). `BASE_MVP` (the internal default plan code assigned at tenant creation, distinct from the three commercial `ESTETICA_*` codes) resolves to `ESTETICA_START`'s feature set and limits — tenants without an explicit commercial plan get entry-tier access rather than being blocked from everything once Phase 2 guards are enabled. Backend override of limits per tenant (for founding-customer negotiation) is expected to reuse the existing `TenantFeature`/`platform` persistence layer rather than a new structure; `shared` remains the default and type contract (see `applyPlanFeatureOverrides`).

## Governance rules
1. New decisions must be added with sequential ID.
2. Any contradictory proposal must list affected decisions and migration path.
3. Accepted decisions are mandatory for prompts, coding, and reviews.
