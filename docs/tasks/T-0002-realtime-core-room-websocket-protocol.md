# T-0002: Realtime Core - Room WebSocket Protocol and State Sync

- Status: done
- Milestone: M2
- PRD Reference: 6, 7, 8, 9, 10, 12, 14

## Objective
Implement the realtime foundation for host and players using Durable Objects and WebSockets, with authoritative room state sync and versioned event contracts.

## Scope
### In
1. Durable Object WebSocket lifecycle for room participants (host + players).
2. Versioned message envelope and event taxonomy.
3. Full-room state snapshot and incremental broadcast updates.
4. Role-validated action handling (`host.*`, `player.*`).
5. Reconnect state resync path over websocket.
6. Presence tracking (`connected`, `disconnected`, heartbeat-based stale detection).
7. Error contract for protocol and authorization failures.

### Out
1. Team assignment algorithms (M3).
2. Trivia gameplay engine and scoring logic (M4).
3. Analytics warehouse/export pipeline.
4. UI polish beyond protocol requirements.

## Dependencies
1. `T-0001` completed (auth, room creation, join, reconnect token).
2. Durable Object binding configured in Worker runtime.
3. Token signing/verification utilities available.
4. Room persistence tables available in D1.

## API / Contract Impact
1. `GET /api/rooms/:roomId/ws?role=host|player` (or upgrade route equivalent).
2. Protocol version `v1` envelope:
- `type`
- `requestId` (optional)
- `ts`
- `payload`
3. Client -> server messages:
- `host.lockLobby`
- `host.startTeams`
- `host.startGame`
- `host.endSession`
- `player.heartbeat`
- `player.input` (generic placeholder for future games)
4. Server -> client messages:
- `room.state`
- `room.diff`
- `room.presence`
- `room.error`
- `room.ack`

## Data Model Impact
1. Optional additional D1 table for connection diagnostics:
- `room_connection_events` (room_id, actor_id, role, event_type, created_at, meta)
2. Room snapshot persistence fields may be expanded in `rooms`:
- `state_version`
- `state_json` (or reference to event-based reconstruction strategy)

## Implementation Plan
1. Define protocol schema in code (`protocol/v1.ts`):
- Types for inbound/outbound envelopes.
- Role-specific allowed message map.
2. Implement WebSocket upgrade route and auth guard:
- Host token required for host channel.
- Player room-bound token required for player channel.
3. Implement DO connection registry:
- Host connection slot (single active host connection with replace semantics).
- Player connections keyed by playerId with reconnect replacement.
4. Implement room snapshot broadcast model:
- On connect: send `room.state` snapshot.
- On state mutation: send `room.diff` + version increment.
5. Implement authoritative action dispatcher:
- Reject unauthorized action types by role.
- Return structured `room.error` with codes.
6. Implement heartbeat and stale connection handling:
- Track last-seen timestamps.
- Cleanup disconnected clients.
- Broadcast `room.presence` changes.
7. Implement reconnect resync flow:
- Player reconnect replaces old socket.
- Server sends latest `room.state` immediately.
8. Persist critical transitions/events to D1 for diagnostics/recovery.
9. Add protocol-level tests and reconnect integration tests.

## Acceptance Criteria
1. Host and player clients can connect to room websocket with token validation.
2. Invalid or wrong-role tokens are rejected with deterministic error code.
3. Newly connected clients receive full room snapshot (`room.state`).
4. State mutations emit ordered updates with monotonic state version.
5. Reconnecting player receives latest state and resumes without duplicate identity.
6. Presence changes are broadcast to host view in near real-time.
7. Unknown/forbidden message types return protocol errors without crashing room DO.
8. Event logs include connect/disconnect/auth failure markers for debugging.

## Validation Checklist
- [x] Lint/typecheck pass.
- [ ] Unit tests for protocol validation and role authorization map.
- [x] Integration-style smoke runs for host/player action flow + state/event sync.
- [ ] Integration test for stale heartbeat disconnect behavior.
- [x] Manual: role-forbidden action path returns deterministic protocol error.
- [x] Manual: reconnect + state fetch restores latest room snapshot.

## Validation Evidence (2026-02-22)
1. Implemented protocol module: `lib/server/protocol-v1.ts`.
2. Implemented sync endpoints:
- `POST /api/rooms/:roomId/actions`
- `GET /api/rooms/:roomId/state`
- `GET /api/rooms/:roomId/events?since=`
3. Smoke results:
- host `host.lockLobby` -> `200`, room state advanced.
- player `player.heartbeat` -> `200`.
- player attempting host action -> `403 ACTION_FORBIDDEN`.
- event diff endpoint returns ordered events with `roomVersion`.

## Notes
1. Transport currently uses HTTP action + diff polling in Next.js route handlers.
2. Same protocol envelope is designed to map to Cloudflare DO WebSockets in a later transport swap.

## Rollback Plan
1. Revert websocket protocol route and DO dispatch changes.
2. Disable realtime endpoint feature flag (if introduced).
3. Keep fallback polling path disabled for non-realtime sessions.
4. Roll back schema additions for diagnostics table if needed.

## Risks / Notes
1. Message ordering issues can desync clients without explicit state version checks.
2. Connection spikes can cause noisy presence events without debouncing.
3. Overly chatty diffs can increase Worker/DO costs; batching strategy may be required.
4. Protocol versioning must be locked before multi-client release.
