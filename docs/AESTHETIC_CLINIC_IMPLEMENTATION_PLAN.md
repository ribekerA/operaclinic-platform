# Aesthetic Clinic Implementation Plan

## Objective

Turn OperaClinic into a product explicitly specialized for aesthetic clinics across:

- domain model
- operational language
- reception and scheduling flows
- patient profile
- treatment journey
- clinic management metrics

This plan assumes we should evolve the current core instead of rebuilding it.

## Guiding Principle

The project already sells itself correctly as an aesthetic-clinic SaaS.
The main gap is not commercial positioning. The main gap is that the operational core still behaves like a generic clinic system.

Priority should be:

1. specialize existing entities
2. preserve current scheduling and messaging stability
3. add aesthetic-only value on top of the current baseline

## Delivery Order

## Phase 1 - Domain Alignment

### Goal

Remove generic or overly medical assumptions from the core structure.

### Prisma / Data Model

- Keep current `ConsultationType` table initially for compatibility, but evolve it into a procedure-oriented entity.
- Add fields to `ConsultationType`:
  - `category`
  - `bodyArea`
  - `preparationNotes`
  - `aftercareNotes`
  - `recoveryTimeLabel`
  - `recommendedReturnDays`
  - `requiresEquipment`
  - `requiresRoom`
- Replace `Professional.professionalRegister` with a broader credential structure:
  - `credentialType`
  - `credentialNumber`
  - `credentialIssuerUf`
  - `occupationTitle`
- Keep `professionalRegister` temporarily only as a migration bridge if needed.
- Add `Specialty.slug` and optional `Specialty.groupName` to support curated aesthetic categories.

### Backend

- Keep API routes stable at first to avoid breaking the web app.
- Change service validations to accept the new professional credential fields.
- Add mapping logic so existing responses can still expose legacy fields during transition.
- Add curated default specialty catalog for aesthetic clinics.
- Add curated default procedure catalog for aesthetic clinics.

### Frontend

- Rename UI copy:
  - `Tipos de consulta` -> `Procedimentos`
  - `Primeira consulta` -> `Primeira avaliacao`
  - `Retorno` -> `Revisao` or `Retorno estetico`
- Update professional forms to collect:
  - occupation
  - credential type
  - credential number
  - specialties/procedure groups
- Update specialty screens to present prebuilt aesthetic categories instead of raw empty CRUD.

### Seeds

- Replace demo professional credential `CRM-SP-000001` with realistic aesthetic examples.
- Seed professional roles such as:
  - Medica dermatologista
  - Biomédica esteta
  - Enfermeira esteta
  - Dentista HOF
  - Fisioterapeuta dermato funcional
- Seed procedure catalog such as:
  - Avaliacao estetica
  - Toxina botulinica
  - Preenchimento labial
  - Bioestimulador de colageno
  - Skinbooster
  - Peeling quimico
  - Microagulhamento
  - Limpeza de pele premium
  - Drenagem pos-operatoria

### Acceptance Criteria

- No UI should force CRM-style assumptions as the only valid professional identity.
- Scheduling and reception should show procedure-oriented language.
- New tenant demo should feel like an aesthetic clinic on first load.

## Phase 2 - Aesthetic Patient Profile

### Goal

Turn the patient record into an aesthetic treatment profile instead of an administrative card only.

### Prisma / Data Model

- Add fields to `Patient`:
  - `primaryAestheticGoal`
  - `mainComplaint`
  - `skinType`
  - `fitzpatrickScale`
  - `contraindications`
  - `allergies`
  - `currentMedications`
  - `pregnancyStatus`
  - `lactationStatus`
  - `aestheticHistoryNotes`
  - `lifestyleNotes`
- Prefer separate normalized tables for items that may repeat:
  - `PatientAllergy`
  - `PatientContraindication`
  - `PatientTreatmentInterest`

### Backend

- Extend DTOs and patient services to accept the new fields.
- Keep current patient search stable by name, document and contact.
- Add filtering by treatment interest and patient status later if needed.

### Frontend

- Split patient form into sections:
  - Identificacao
  - Contato
  - Perfil estetico
  - Restricoes e seguranca
  - Historico
- Keep reception view lightweight, but add deeper fields inside the patient sheet.

### Seeds

- Seed patients with realistic aesthetic intents:
  - rejuvenescimento facial
  - melasma
  - flacidez
  - gordura localizada
  - pos-operatorio

### Acceptance Criteria

- Reception can register the patient fast.
- Clinical/admin team can understand goal, restrictions and treatment context without external notes.

## Phase 3 - Treatment Journey and Packages

### Goal

Model how aesthetic clinics actually sell and deliver value: plans, sessions and continuity.

### Prisma / Data Model

- Add `TreatmentPlan`
- Add `TreatmentPlanItem`
- Add `SessionPackage`
- Add `SessionPackageUsage`
- Add `ProcedureSession`
- Add `ProcedureRecommendation`

Suggested minimum structure:

- `TreatmentPlan`
  - patient
  - responsible professional
  - clinical objective
  - commercial status
  - total planned sessions
- `SessionPackage`
  - name
  - procedure type
  - included sessions
  - used sessions
  - expiration date
- `ProcedureSession`
  - scheduled appointment
  - outcome summary
  - next recommended interval

### Backend

- Add endpoints for:
  - create treatment plan
  - attach procedures to plan
  - create package
  - consume package session
  - list remaining sessions
- Add guards to prevent booking package-only sessions with no remaining balance if required.

### Frontend

- Add a patient journey tab:
  - current plan
  - packages
  - completed sessions
  - recommended next session
- Show package balance in reception before confirming a new appointment.

### Seeds

- Seed one patient with a facial rejuvenation plan.
- Seed one patient with a post-op drainage package.

### Acceptance Criteria

- Staff can see if the appointment belongs to a package or an isolated service.
- The product can represent repeated aesthetic sessions natively.

## Phase 4 - Consent, Photos and Post-Care

### Goal

Add the operational assets that make aesthetic clinics defensible and premium.

### Prisma / Data Model

- Add `ConsentTerm`
- Add `PatientConsentAcceptance`
- Add `PatientMedia`
- Add `PostCareProtocol`
- Add `PostCareFollowUp`

### Backend

- Add endpoints to:
  - attach consent to procedure type
  - record acceptance
  - upload and classify patient media
  - register post-care instructions
  - schedule post-procedure follow-up check

### Frontend

- Add patient tabs:
  - Consentimentos
  - Midia clinica
  - Pos-procedimento
- Add visual comparison structure for before/after with audit metadata.

### Notes

- This should include strict audit logging and permission rules.
- Media handling should be private and traceable.

### Acceptance Criteria

- Each relevant procedure can require consent.
- Before/after assets can be linked to patient and procedure safely.
- Follow-up becomes operational, not informal.

## Phase 5 - Rooms, Equipment and Real Availability

### Goal

Make scheduling reflect actual aesthetic-clinic capacity.

### Prisma / Data Model

- Add `Room`
- Add `Equipment`
- Add `ProcedureRequirement`
- Add `ScheduleResourceBlock`

### Backend

- Availability search should consider:
  - professional schedule
  - room availability
  - equipment availability
  - procedure requirements

### Frontend

- Add room and equipment management.
- Show why a slot is unavailable when resource conflict exists.

### Seeds

- Seed rooms like:
  - Sala facial 1
  - Sala injetaveis
  - Sala laser
  - Cabine corporal
- Seed equipment like:
  - Laser
  - Ultrassom
  - Radiofrequencia

### Acceptance Criteria

- A slot should not appear available if the required room or equipment is blocked.

## Phase 6 - Metrics and Automation for Aesthetic Clinics

### Goal

Move beyond operational CRUD into business intelligence for aesthetic clinics.

### Metrics

- lead to evaluation conversion
- evaluation to procedure conversion
- no-show by procedure
- return rate by procedure
- package utilization
- reactivation opportunity by inactivity window
- occupancy by professional
- occupancy by room
- revenue mix by procedure family

### Messaging / Automation

- pre-evaluation reminders
- pre-procedure preparation reminders
- post-procedure follow-up check
- review request after procedure
- reactivation for inactive patients
- recovery for missed evaluations

### Frontend

- Add dashboards focused on:
  - commercial health
  - treatment continuity
  - idle package balances
  - at-risk patients for churn

### Acceptance Criteria

- Dashboard language and KPIs should look clearly aesthetic-clinic-specific.

## Recommended Technical Strategy

### Strategy 1 - Do not rename core tables first

Avoid a risky big-bang rename from `ConsultationType` to `ProcedureType` at the database layer in the first iteration.

Preferred approach:

1. keep schema/table names stable temporarily
2. change UI language first
3. add aesthetic-specific fields
4. rename internal types only after flows stabilize

### Strategy 2 - Preserve API compatibility during transition

- Add new fields first
- Keep old response fields while web migrates
- Remove legacy fields only after all pages and seeds are updated

### Strategy 3 - Curated defaults beat empty setup

For aesthetic clinics, blank setup creates friction.
The product should ship with:

- specialty presets
- procedure presets
- role presets
- room presets
- realistic messaging copy

## Suggested Sprint Breakdown

### Sprint A

- Phase 1 domain alignment
- UI rename from consultation to procedure
- professional credential refactor
- seed overhaul

### Sprint B

- Phase 2 patient aesthetic profile
- patient sheet redesign
- richer receptionist context

### Sprint C

- Phase 3 treatment plans and packages
- package-aware booking

### Sprint D

- Phase 4 consent, media and post-care

### Sprint E

- Phase 5 room/equipment-aware scheduling
- Phase 6 dashboards and automation

## Highest-Value First Changes

If implementation must start immediately, the best order is:

1. professional credential model refactor
2. consultation/procedure language and catalog refactor
3. patient aesthetic profile
4. treatment plans and packages

These four changes will make the product feel aesthetic-first very quickly, even before advanced modules land.
