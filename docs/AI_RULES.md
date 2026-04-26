# AI Rules - OperaClinic

## Purpose
This document is the operational source of truth for Codex, Copilot, and any automated executor.
All planning, implementation, review, and prompt execution must follow these rules.

## Non-negotiable product decisions
1. The product is a multi-tenant SaaS for aesthetic clinics.
2. In MVP, patients do not have an app.
3. In MVP, patients interact through WhatsApp.
4. Reception operates through a web panel.
5. Professionals use a lightweight dedicated app.
6. Check-in is part of reception operations.
7. A super admin control plane exists.
8. Backend owns schedule state and business rules.
9. Baseline schedule model is professional-centric.
10. Billing is separated from aesthetic clinic operations.
11. AI only interprets requests and calls backend functions.
12. The project starts greenfield from zero.
13. Development must enable mock-driven tests and low API cost.

## Execution guardrails
1. Never move business rules to frontend or prompts.
2. Never couple billing rules to operational modules of aesthetic clinics.
3. Never define patient mobile app features in MVP scope.
4. Never bypass tenant isolation assumptions.
5. Never make automated decisions outside explicit backend functions.

## Prompt and automation policy
1. Read and honor `docs/decisions.md` before proposing changes.
2. Use `docs/blueprint-master.md` as architecture baseline.
3. Use `docs/TASK_TEMPLATE.md` and `docs/DONE_TEMPLATE.md` for task lifecycle.
4. Follow `docs/TEST_STRATEGY.md` for quality gates.
5. If a request conflicts with these rules, block and report the conflict.

## Change governance
1. Any change to non-negotiable decisions requires explicit update in `docs/decisions.md`.
2. Decision updates must include rationale, impact, and migration notes.
3. Prompts and automation scripts must reference the latest decision register version.

## Definition of compliance
An automated output is compliant only if it:
1. Keeps tenant boundaries explicit.
2. Keeps backend as source of truth for schedule and logic.
3. Preserves billing separation.
4. Uses mock-first test planning when external APIs are involved.
5. Avoids out-of-MVP features unless explicitly approved.
