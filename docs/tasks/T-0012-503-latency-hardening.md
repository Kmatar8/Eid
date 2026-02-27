# T-0012: 503 + Latency Hardening (Polling, Heartbeats, Shared Store)

- Status: done
- Milestone: M5
- PRD Reference: 14, 11, 12

## Objective
Reduce transient `503` failures and host/controller desynchronization by lowering request pressure, removing noisy event writes, and optimizing shared-store synchronization behavior.

## Scope
### In
1. Stop emitting high-frequency heartbeat events to `room_events`.
2. Add bounded room-event retention to prevent unbounded store growth.
3. Add shared-store hydrate/persist throttling to avoid Durable Object round-trips on every request.
4. Add API no-store headers for live state endpoints (via common response helper).
5. Add visibility-aware polling/heartbeat behavior on host/controller/room clients to prevent hidden-tab request storms.
6. Add safe retry strategy for GET requests on transient upstream errors (`502/503/504/429` and fetch failures).

### Out
1. Full migration to websocket push model.
2. Durable Object room-per-session architecture rewrite.
3. Gameplay rule changes.

## Dependencies
1. Existing store and store-sync modules.
2. Existing polling-based client screens.

## API / Contract Impact
1. No contract shape changes.
2. Response headers updated to disable caching for API JSON responses.

## Data Model Impact
1. D1: no schema changes.
2. Runtime in-memory store: bounded event retention only.
3. R2: no changes.

## Implementation Plan
1. Patch server store event behavior and retention limits.
2. Patch shared-store sync throttling logic.
3. Patch HTTP response helper headers.
4. Patch client polling/heartbeat loops for visibility + overlap protection.
5. Patch client GET retry strategy.
6. Validate via lint/build and summarize impact.

## Acceptance Criteria
1. Heartbeats no longer create event-log growth pressure.
2. Event log size is bounded in memory.
3. Shared-store sync avoids per-request DO hydrate/persist churn.
4. Hidden tabs stop frequent polling/heartbeats.
5. GET requests recover better from transient upstream 5xx.
6. Lint/build pass.

## Validation Checklist
- [x] Lint pass.
- [x] Build pass.
- [x] Manual-ready: hidden-tab request suppression implemented in host/controller/room polling loops.
- [x] Manual-ready: host/controller sync pressure reduced via store sync + heartbeat event suppression.
- [x] Manual-ready: transient 503 resilience improved with GET retry strategy and reduced backend churn.

## Validation Evidence
1. `npm run lint` passed with warnings only (no errors).
2. `npm run build` passed.
3. Code-level verification:
   - Heartbeat actions now return synthetic ACK events without persisting to `room_events`.
   - Shared store sync now uses hydrate TTL + single-flight and revision-aware persistence.
   - Client polling/heartbeats are visibility-aware and prevent overlapping in-flight refresh requests.
   - API JSON responses are now explicitly `no-store`.

## Rollback Plan
1. Revert changed files in this task.
2. Deploy previous stable commit.

## Notes / Risks
1. Throttled persistence introduces short eventual-consistency windows across isolates.
2. Bounded event retention may limit long-window diagnostic replay.
