# AGENTS.md

This file defines how contributors (human or AI agents) execute work in this repository.

## 1. Mission
Ship a reliable real-time party-game platform (TV host + mobile controllers) using a task-oriented, plan-first workflow.

## 2. Source of Truth
1. `PRD.md` is the product source of truth.
2. Any work that changes requirements must first update `PRD.md`.
3. If code and PRD conflict, stop and reconcile before implementation.

## 3. Mandatory Workflow (Plan Before Code)
For every implementation item:
1. Create/update a task file under `docs/tasks/`.
2. Define scope, acceptance criteria, and test plan.
3. Only then implement code.
4. Record validation evidence before marking task done.

No direct coding without an explicit task entry.

## 4. Task File Convention
- Path: `docs/tasks/T-XXXX-short-name.md`
- Status values: `planned`, `in_progress`, `blocked`, `done`

Required sections:
1. Objective
2. Scope (in/out)
3. Dependencies
4. Implementation plan (step-by-step)
5. Acceptance criteria
6. Validation checklist
7. Rollback plan
8. Notes/risks

## 5. Milestone Planning
Group tasks into PRD milestones:
1. M1 Foundation
2. M2 Realtime Core
3. M3 Teaming + Scoreboard
4. M4 Trivia v1
5. M5 Reliability + Scale

Every task must map to one milestone.

## 6. Branch and Commit Rules
1. One task = one branch.
2. Branch format: `feat/T-XXXX-short-name` or `fix/T-XXXX-short-name`.
3. Commit message format:
- `feat(T-XXXX): ...`
- `fix(T-XXXX): ...`
- `docs(T-XXXX): ...`

## 7. Definition of Ready (DoR)
A task is ready only if:
1. PRD section reference is listed.
2. API/events/contracts impacted are listed.
3. Data model impact is listed (D1/DO/R2).
4. Acceptance criteria are testable.

## 8. Definition of Done (DoD)
A task is done only if:
1. Acceptance criteria pass.
2. Local checks pass (`lint`, `typecheck`, tests for affected scope).
3. Task file updated with validation evidence.
4. Any PRD-impacting changes are documented.
5. Observability/error handling added for new runtime paths.

## 9. Realtime Engineering Rules
1. Durable Object is the authority for room state.
2. Never trust client state for scoring, team membership, or progression.
3. All host actions require host role validation.
4. All player actions must include room-bound identity token.
5. Persist critical transitions via D1 snapshots/events.

## 10. Data and Migration Rules
1. Schema changes must include migration scripts and rollback notes.
2. Backward compatibility must be explicit for active sessions.
3. Avoid destructive migrations without recovery strategy.

## 11. Reliability Rules
1. Implement explicit timeout handling for room lifecycle states.
2. Implement reconnect-safe logic before feature completion.
3. Keep idempotency for host actions (e.g., `startGame`, `nextQuestion`).
4. Log structured room events for debugging and replay.

## 12. Security Rules
1. Passwords must be hashed, never stored plaintext.
2. Tokens must be signed and room-bound.
3. No privileged action over unauthenticated channels.
4. Validate and sanitize all user-provided fields.

## 13. QA and Validation Minimum
For each task, include:
1. Unit tests for pure logic (selection/scoring/state transitions).
2. Integration test for API/DO flow where applicable.
3. Manual scenario checklist for host + player + reconnect path.

## 14. Documentation Rules
1. Keep docs concise and executable.
2. Update `docs/tasks/` status during execution, not after.
3. Add architecture notes when introducing cross-cutting changes.

## 15. Escalation Rules
Stop and ask for decision when:
1. Requirement ambiguity affects architecture.
2. Security tradeoff is required.
3. Data loss risk exists.
4. Performance/cost risk exceeds PRD assumptions.
