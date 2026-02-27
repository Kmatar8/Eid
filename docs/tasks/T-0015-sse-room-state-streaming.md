# T-0015: SSE Room State Streaming (Near Real-Time Sync)

- Status: in_progress
- Milestone: M2
- PRD Reference: 6, 10.1, 12.3, 14

## Objective
Implement server-sent event (SSE) streaming for room state updates so host and controllers receive near real-time state pushes with polling only as fallback.

## Scope
### In
1. Add authenticated SSE endpoint for room state stream.
2. Add shared client stream subscriber utility (fetch + SSE parser + reconnect).
3. Integrate SSE subscriber in host and controller pages.
4. Keep existing polling as fallback when stream is disconnected.
5. Tune shared-store hydrate cadence for better stream freshness.

### Out
1. Full WebSocket bidirectional protocol.
2. Rewriting gameplay logic or state machine.
3. Changing API envelope schema.

## Dependencies
1. Existing room state snapshot builder.
2. Existing bearer token auth model.
3. Existing `withSharedStore` synchronization utilities.

## API / Contract Impact
1. New endpoint: `GET /api/rooms/[roomId]/stream` (`text/event-stream`).
2. Stream payload uses existing `room.state` server envelope format.

## Data Model Impact
1. D1: no schema changes.
2. Runtime state: no model changes.

## Implementation Plan
1. Create SSE stream route with auth + snapshot push + keepalive.
2. Create client SSE subscriber helper with auto-reconnect.
3. Wire host page to stream updates and use polling only when disconnected.
4. Wire controller page similarly.
5. Adjust shared-store hydrate TTL for faster cross-isolate freshness.
6. Validate with lint/build.

## Acceptance Criteria
1. Host receives pushed room updates without waiting for polling interval.
2. Controllers receive pushed room updates with reduced visible lag.
3. Polling still recovers state when stream is unavailable.
4. Lint/build pass.

## Validation Checklist
- [x] Lint pass.
- [x] Build pass.
- [ ] Manual: host + 2 controllers show reduced countdown/result drift.
- [ ] Manual: stream reconnects after temporary disconnection.

## Validation Evidence
1. `npm run lint` completed successfully (warnings only, no errors).
2. `npm run build` completed successfully and includes dynamic route `GET /api/rooms/[roomId]/stream`.
3. Host, controller, and TV client pages now subscribe to `/api/rooms/[roomId]/stream` and keep polling as fallback when stream disconnects.
4. Manual multi-device validation remains pending on live environment.

## Rollback Plan
1. Revert stream route + client stream utility.
2. Revert host/controller stream integration.
3. Restore previous polling-only behavior.

## Notes / Risks
1. SSE is one-way; client actions still use existing POST endpoints.
2. Streaming connections consume concurrent connection capacity; fallback polling remains available.
