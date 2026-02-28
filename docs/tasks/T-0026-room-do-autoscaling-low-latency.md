# T-0026: Room-Scoped Durable Object Autoscaling + Low-Latency Realtime

- Status: in_progress
- Milestone: M5
- PRD Reference: 7, 7.2, 7.3, 9, 10.3, 11, 14, 16

## Objective
Deliver a room-sharded realtime architecture that sustains `1,000-5,000` concurrent rooms with near real-time updates and stable latency by moving room authority/transport to per-room Durable Objects with websocket hibernation and alarm-driven timers.

## Scope
### In
1. Route each room to a dedicated Durable Object instance (`1 room = 1 DO`).
2. Replace high-frequency SSE polling path with websocket transport backed by room DO.
3. Move authoritative room runtime state from global shared runtime store to room DO state.
4. Replace request-bound timeout transitions with Durable Object alarms (countdown, buzzer, answer window, inactivity, pause grace, hard cap).
5. Add per-room backpressure, rate limiting, and idempotency enforcement for host actions.
6. Push non-critical persistence/analytics to async Queue consumers (off hot path).
7. Add observability and load validation for `1k` and `5k` concurrent room profiles.
8. Roll out behind feature flags with controlled canary phases.

### Out
1. New game modes or gameplay rule changes.
2. UI redesign beyond connection/reconnect state handling required by transport migration.
3. Multi-region active-active state replication between room authorities.

## Dependencies
1. `T-0005` reliability hardening baseline.
2. Existing host/controller/TV routes and protocol contracts.
3. Cloudflare bindings for Durable Objects and Queues in staging/prod.
4. Load test runner and scenario profiles for websocket concurrency.

## API / Events / Contract Impact
1. Add/activate websocket room endpoint contract (host/player role-authenticated session upgrade).
2. Define room DO event envelopes:
   - `room.sync` (initial snapshot)
   - `room.state.delta` (versioned incremental update)
   - `room.error` (deterministic failure contract)
   - `room.presence` (optional lightweight presence updates)
3. Keep/adjust host actions for idempotency and deterministic replay (`requestId` required for critical host actions).
4. Deprecate legacy high-frequency SSE stream path after rollout validation.

## Data Model Impact (D1 / DO / R2)
1. D1:
   - Keep critical audit/event persistence append-only.
   - Add/confirm indexes for `room_id`, `seq`, `created_at` on room-event persistence tables used for debugging/replay.
2. DO:
   - Store authoritative room snapshot, version/seq, participants, timers, and idempotency ledger inside each room DO.
   - Persist minimal recovery checkpoint per room DO.
3. R2:
   - No required change in this task (optional future cold archival only).

## Implementation Plan
1. Produce architecture note for room-sharded DO authority and transport flow.
2. Introduce runtime feature flags for transport/state authority (`legacy_store`, `room_do_ws`).
3. Implement room DO connection registry (host slot + player set) with signed room-bound token validation.
4. Port room state machine mutations to room DO command handlers (host/player actions).
5. Implement alarm-driven timed transitions for lifecycle and trivia windows.
6. Add versioned delta broadcast with periodic full snapshot sync guard.
7. Update host/controller/TV clients to websocket subscription + reconnect/resync behavior.
8. Move non-critical writes (analytics, expanded telemetry, replay enrichment) to Queue consumer pipeline.
9. Add per-room action throttles and global defensive limits for malformed/flood traffic.
10. Add structured metrics/logs for:
    - broadcast latency
    - reconnect success latency
    - alarm drift
    - rejected/limited actions
11. Execute staged load validation:
    - `100` concurrent rooms canary profile (current execution scope)
    - `1k` concurrent rooms baseline
    - `5k` concurrent rooms peak
    - reconnect storm + host churn profile
12. Canary rollout and cutover; remove legacy stream polling path after stable burn-in.

## Acceptance Criteria
1. At `1,000` concurrent rooms, p95 host-action-to-controller-update latency is `<= 250ms`.
2. At `5,000` concurrent rooms, p95 host-action-to-controller-update latency is `<= 400ms`.
3. Lifecycle and trivia timers progress via alarms without requiring client polling activity.
4. Reconnect returns usable synced state within `<= 3s` for p99 under load profile.
5. No authority regressions: scoring/team/progression remain server authoritative and role validated.
6. Critical host commands remain idempotent under duplicate/retry traffic.
7. Canary rollout completes without Sev1/Sev2 reliability regression.

## Validation Checklist
- [x] Lint pass.
- [x] Build pass (includes TypeScript check).
- [ ] Unit tests for state transitions, timer transitions, and idempotency logic.
- [ ] Integration tests for websocket auth, role guards, and command handling.
- [ ] Integration tests for reconnect/resync under active question phases.
- [ ] Load test harness + execution at `100` concurrent rooms (canary profile).
- [ ] Load test pass at `1k` concurrent rooms (latency + error budget thresholds).
- [ ] Load test pass at `5k` concurrent rooms (latency + error budget thresholds).
- [ ] Reconnect storm profile pass with no state corruption.
- [ ] Canary metrics review completed and signed off.

## Rollback Plan
1. Keep `legacy_store` and legacy stream transport behind kill switch during rollout window.
2. If instability or latency regression occurs, disable `room_do_ws` feature flag and route traffic back to legacy path.
3. Preserve event/metric logs for regression triage before next canary attempt.
4. Re-run smoke + reconnect validation after rollback to confirm service recovery.

## Notes / Risks
1. Incorrect sharding/routing can create uneven hot partitions and latency spikes.
2. Large payload broadcasts can become network bottlenecks; delta design must be bounded.
3. Alarm drift and wake-up edge cases must be tested against reconnect and pause/resume flows.
4. Over-instrumentation on hot path can increase cost and latency; use sampled telemetry where possible.

## Progress Notes
1. Started Phase 1: add room-scoped DO store plumbing and feature-flagged routing path while preserving legacy behavior as default.
2. Added room-shard import/export primitives in `lib/server/store.ts` so room state can be hydrated/persisted without overwriting unrelated rooms.
3. Added feature-flagged room-scoped store sync path in `lib/server/store-sync.ts`:
   - `HROOF_ROOM_SCOPED_DO_STORE` gate
   - `withRoomScopedStore(roomId, operation)`
   - room-shard hydrate/persist functions
4. Migrated room-specific API routes to use `withRoomScopedStore` (state/actions/join/reconnect/events/end/stream) with fallback to legacy `withSharedStore` when flag is disabled.
5. Added room-shard-only hot path helper (`withRoomShardStore`) that skips global-store sync when not required; room routes now use:
   - `withRoomShardStore` for state/events/join/reconnect/stream
   - `withRoomShardStore` for most actions
   - `withRoomScopedStore` only for `host.endSession` actions and `/end` route (global host-room ownership updates)
6. Reworked SSE stream backend fanout to shared per-room hub within runtime process:
   - single poll loop per room per process instead of per-connection poll loops
   - subscriber fanout for state updates and terminal errors
7. Added event-driven stream wake-up path by subscribing stream hubs to in-process room event notifications from store mutations; reduced fallback poll to `1000ms` as cross-instance safety net.
8. Added per-subscriber authorization checks on stream fanout to enforce role/room validity on every pushed update (host ownership + player active membership/state), closing invalid subscribers deterministically.
9. Tuned store sync hydration TTLs to reduce room-shard DO read pressure on hot paths while preserving lower-latency global sync behavior:
   - global store hydrate TTL: `350ms`
   - room shard hydrate TTL: `1000ms`
10. Validation run:
   - `npm run lint` (warnings only; no errors)
   - `npm run build` (success)
11. Extended room-scoped DO persistence path to publish best-effort room delta events (`room.state.delta`) after successful snapshot writes, enabling cross-instance transport consumers to react without adding synchronous cost to mutation handlers.
12. Added host action hardening on hot path (`/api/rooms/[roomId]/actions`):
   - enforce `requestId` for critical host commands (idempotency contract)
   - add per-room host action throttling guard (default `120` actions / `5s`, configurable via `HROOF_HOST_ACTIONS_PER_5S`)
13. Extended room DO worker capabilities for Phase 2 transport/runtime groundwork:
   - `/publish` event ingestion + websocket fanout support (`/ws`)
   - alarm queue CRUD (`/alarm`) and `alarm()` execution path with emitted `room.alarm.fired` events
   - lint cleanup for worker default export
14. Validation run (post-hardening + worker updates):
   - `npm run lint` (warnings only; no errors)
   - `npm run build` (success)
15. Added executable 100-room load canary harness:
   - script: `scripts/load-rooms-100.mjs`
   - npm command: `npm run load:rooms-100`
   - supports host credential pool, 100-room cap, 20 players/room default, and p50/p95/p99 latency summary.
16. Updated README with load canary usage and credential requirements for concurrent room runs.
