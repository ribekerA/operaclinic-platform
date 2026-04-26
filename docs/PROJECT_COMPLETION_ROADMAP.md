# Project Completion Roadmap

## Objective

Turn the completion checklist into an execution sequence with:

- sprint focus
- main deliverables
- dependencies
- business impact

Status reference lives in:

- [PROJECT_COMPLETION_CHECKLIST.md](C:/Users/byimp/OneDrive/Documentos/GitHub/operaclinic-platform/docs/PROJECT_COMPLETION_CHECKLIST.md)

## Assumption

This roadmap assumes the current foundation remains in place and the next work should optimize for:

1. operational readiness
2. production safety
3. aesthetic-clinic specialization

## Sprint 1 - Production Hardening

### Implementation Note - 2026-04-01

The following Sprint 1 items are already reflected in code:

- tenant timezone and database time are now authoritative in critical scheduling flows
- scheduling blocks now require ISO datetime with explicit offset
- Stripe/payment configuration is validated through explicit config namespaces
- API readiness endpoint is live at `/api/v1/health/readiness`
- platform dashboard now surfaces operational readiness and immediate actions
- production runbook is documented in [PRODUCTION_READINESS_RUNBOOK.md](C:/Users/byimp/OneDrive/Documentos/GitHub/operaclinic-platform/docs/PRODUCTION_READINESS_RUNBOOK.md)

What still remains from Sprint 1 is rollout validation, not foundation work:

- real Stripe production validation
- real Meta WhatsApp production validation
- residual concurrency validation under heavier load

### Focus

Stabilize the core already delivered before expanding the domain.

### Deliverables

- strengthen scheduling concurrency protection
- make tenant timezone authoritative across scheduling flows
- close production readiness checks for Stripe
- close production readiness checks for WhatsApp/Meta
- align docs with actual shipped state
- consolidate critical operational runbooks

### Dependencies

- existing scheduling core
- existing Stripe adapter
- existing Meta WhatsApp adapter

### Impact

- high technical risk reduction
- medium product visibility
- high production readiness gain

### Why first

There is no value in adding advanced aesthetic modules on top of a core that is still partially exposed in concurrency and rollout safety.

## Sprint 2 - Professional Experience

### Focus

Finish the missing professional surface.

### Deliverables

- replace professional placeholder panel with real workspace
- show personal agenda
- show upcoming sessions
- show patient context needed by professional
- expose check-in/ready-to-call context where appropriate
- preserve role isolation between reception and professional

### Dependencies

- Sprint 1 hardening should be done first
- current auth and professional contracts already exist

### Impact

- high user-facing impact
- high completeness gain for MVP
- medium technical complexity

### Why second

The professional app is the clearest incomplete product surface in the current repo.

## Sprint 3 - Aesthetic Domain Alignment

### Focus

Make the operational model speak the language of aesthetic clinics.

### Deliverables

- evolve `ConsultationType` toward procedure-oriented semantics
- broaden `professionalRegister` into aesthetic-compatible credential model
- complete UI copy migration from generic clinic terms to aesthetic terms
- finish seed/demo normalization for all demo tenants
- deliver curated aesthetic catalogs for specialties and procedures

### Dependencies

- Sprint 1 recommended first
- Sprint 2 can run before or partially in parallel if write scopes are controlled

### Impact

- very high product clarity gain
- high sales/demo impact
- high domain consistency gain

### Why here

After core safety and missing app surface are handled, the next biggest leverage is making the product unmistakably aesthetic-first.

## Sprint 4 - Aesthetic Patient Profile

### Focus

Upgrade patient data from administrative card to aesthetic journey profile.

### Deliverables

- add aesthetic profile fields to patient
- add restrictions and safety context
- add treatment interests and goals
- redesign patient sheet with sections
- preserve fast reception registration flow

### Dependencies

- Sprint 3 domain alignment strongly recommended

### Impact

- high clinical/operational value
- high reception value
- medium schema and UI complexity

### Why here

Once the domain language is corrected, the patient model becomes the next highest-value entity to specialize.

## Sprint 5 - Treatment Plans and Packages

### Focus

Model how aesthetic clinics actually sell and deliver treatments.

### Deliverables

- treatment plans
- package/session balance
- session consumption tracking
- journey view in patient sheet
- package-aware appointment support

### Dependencies

- Sprint 4 patient profile
- Sprint 3 procedure/domain alignment

### Impact

- very high business value
- high retention and operational value
- high domain differentiation

### Why here

This is where the product stops feeling like a generic scheduler and starts behaving like aesthetic-clinic software.

## Sprint 6 - Consent, Media and Post-Care

### Focus

Add defensibility and premium clinical operations.

### Deliverables

- consent terms by procedure
- patient consent acceptance tracking
- before/after media
- post-care protocol registry
- follow-up workflow after procedure

### Dependencies

- Sprint 5 recommended
- Sprint 4 patient profile required

### Impact

- high legal/operational value
- high premium positioning value
- medium to high implementation complexity

### Why here

These modules are powerful but should sit on top of a stable patient and treatment model.

## Sprint 7 - Resource-Aware Scheduling

### Focus

Make availability reflect real clinic capacity.

### Deliverables

- rooms
- equipment
- procedure resource requirements
- room/equipment-aware availability
- conflict visibility in scheduling flows

### Dependencies

- Sprint 3 procedure/domain alignment
- Sprint 5 helps define realistic procedure requirements

### Impact

- medium to high operational value
- high realism for larger clinics
- medium complexity

### Why here

Resource-aware scheduling matters more after procedures are correctly modeled.

## Sprint 8 - Aesthetic Intelligence and Automation

### Focus

Close the loop with metrics and targeted automation.

### Deliverables

- lead to evaluation conversion
- evaluation to procedure conversion
- package utilization metrics
- reactivation opportunities
- pre-procedure reminders
- post-procedure follow-up automation
- no-show and return intelligence

### Dependencies

- Sprint 5 for treatment/package data
- Sprint 6 for post-care signals
- production messaging from Sprint 1

### Impact

- very high management value
- high expansion/revenue value
- medium implementation complexity

### Why last

These automations are strongest when the product already captures the right domain data.

## Delivery Lanes

### Lane A - MVP Operational Completion

This is the shortest path to call the product operationally complete:

1. Sprint 1
2. Sprint 2
3. finish rollout validation

### Lane B - Full Aesthetic Product Completion

This is the shortest path to call the product complete for aesthetic clinics:

1. Sprint 1
2. Sprint 2
3. Sprint 3
4. Sprint 4
5. Sprint 5
6. Sprint 6
7. Sprint 7
8. Sprint 8

## Suggested Priority Matrix

### Highest ROI now

- Sprint 1
- Sprint 2
- Sprint 3

### Highest differentiation next

- Sprint 4
- Sprint 5

### Premium maturity after that

- Sprint 6
- Sprint 7
- Sprint 8

## Practical Recommendation

If the goal is to reach market-ready completeness fast, the best sequence is:

1. close production hardening
2. finish professional experience
3. specialize the domain to aesthetic clinics

If the goal is to maximize category value after that, continue with:

4. patient aesthetic profile
5. treatment plans and packages
6. consent, media and post-care

## Estimated Complexity

- Sprint 1: high
- Sprint 2: medium
- Sprint 3: high
- Sprint 4: medium to high
- Sprint 5: high
- Sprint 6: high
- Sprint 7: medium to high
- Sprint 8: medium

## Blocking Dependencies Summary

- Scheduling hardening blocks safe scale
- Professional workspace blocks MVP completeness
- Domain alignment blocks full aesthetic coherence
- Patient profile blocks treatment journey depth
- Treatment plans block premium automation quality
