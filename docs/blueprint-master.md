# Blueprint Master - OperaClinic

## Product vision
OperaClinic is a multi-tenant SaaS platform that orchestrates aesthetic clinic operations with backend-owned scheduling and clear domain boundaries.
In MVP, patient interaction is conversational through WhatsApp, while reception executes operational workflows through a web panel.

## Main modules
1. Tenant and access foundation
2. Reception operations
3. Scheduling core (backend-owned)
4. Professional app support APIs
5. Super admin control plane
6. Integration layer (WhatsApp + AI function calling)
7. Billing domain (separated boundary)

## Actors
1. Patient: interacts only through WhatsApp in MVP.
2. Reception agent: manages appointments and check-in through web panel.
3. Professional: consumes lightweight app experience.
4. Super admin: manages platform-wide settings and governance.

## MVP scope
1. Multi-tenant base architecture and tenant isolation.
2. Reception web panel base workflows.
3. Backend scheduling engine with professional-based agenda model.
4. Check-in under reception ownership.
5. AI orchestration limited to intent interpretation and backend function calls.
6. Technical foundations for mock-driven tests and low-cost API usage.

## Out of MVP
1. Patient mobile app.
2. Final production-grade UI polish for all modules.
3. Advanced aesthetic clinic operational modules beyond core baseline.
4. Full billing implementation in operational flows.
5. Broad non-critical automations without defined backend contracts.

## Main stack
1. Monorepo: pnpm workspace + Turborepo
2. Backend target: NestJS (`apps/api`)
3. Reception web target: Next.js (`apps/web`)
4. Shared contracts/utilities: `packages/shared`
5. Testing: unit/integration/contract with strong mock strategy

## Summarized build order
1. Sprint 0: governance docs, repo conventions, architecture baseline, quality strategy.
2. Sprint 1: backend foundation, control plane, identity and reception web shell.
3. Sprint 2: aesthetic clinic structure baseline for units, specialties, professionals and consultation types.
4. Sprint 3: patients and scheduling core with professional-based agenda ownership.
5. Sprint 4: scheduling stabilization, reception operational baseline and shared runtime contracts.
6. Next: WhatsApp adapter contracts, AI function-call orchestration and controlled pilot flows.
7. Later: professional lightweight app delivery and billing domain expansion.
