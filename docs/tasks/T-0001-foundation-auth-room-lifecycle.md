# T-0001: Foundation - Host Auth, Room Lifecycle, QR Join, Reconnect

- Status: done
- Milestone: M1
- PRD Reference: 5, 6, 7, 9, 10, 11, 12, 13

## Objective
Implement the first production-ready foundation slice for Hroof:
1. Host authentication using pre-generated credentials.
2. One-active-room-per-host enforcement.
3. Room creation and lifecycle state handling for foundation states.
4. QR-based player join flow.
5. Player reconnect while room is active.

## Scope
### In
1. D1 schema and migrations for foundational entities:
- `hosts`
- `rooms`
- `players`
- `room_events`
2. Host login endpoint and signed host session token issuance.
3. Room creation endpoint with one-active-room guard.
4. Durable Object room skeleton with authoritative room state.
5. Player join endpoint (name + optional avatar URL/emoji).
6. Player reconnect endpoint based on signed `playerSessionToken`.
7. Foundation room states (for M1 path):
- `lobby_open`
- `paused_wait_host`
- `session_completed`
- `expired`
8. Structured event logging for room lifecycle and join/reconnect actions.

### Out
1. Team assignment logic.
2. Trivia/game execution logic.
3. Live scoring engine.
4. Admin dashboard UI.
5. Advanced analytics pipeline.

## Dependencies
1. Cloudflare Workers project configured with:
- Durable Objects binding
- D1 binding
2. Secrets configured for token signing.
3. Pre-generated host credential seed source.
4. Route structure agreed for host/join/controller entry points.

## API / Contract Impact
1. `POST /api/auth/host/login`
2. `POST /api/rooms/create`
3. `POST /api/rooms/:roomId/join`
4. `POST /api/rooms/:roomId/reconnect`
5. Durable Object internal messages for:
- `host.createRoom`
- `player.join`
- `player.reconnect`
- `room.snapshot`

## Data Model Impact
1. New D1 tables/indexes:
- `hosts(username UNIQUE, password_hash, status, active_room_id)`
- `rooms(room_id UNIQUE, host_id, state, created_at, expires_at, superseded_by, ended_at)`
- `players(player_id, room_id, display_name, avatar_type, avatar_value, team_id NULL, created_at, last_seen_at)`
- `room_events(event_id, room_id, event_type, payload_json, created_at)`
2. Unique/guard constraints to prevent multiple active rooms for one host.

## Implementation Plan
1. Add D1 migration `0001_foundation.sql` for hosts/rooms/players/events + indexes.
2. Implement host auth service:
- Verify password hash.
- Issue signed host token (room-less session).
3. Implement room creation service:
- Reject if host already has active room.
- Create room in `lobby_open`.
- Create/initialize Durable Object for room.
4. Implement join service:
- Validate active room state.
- Create player record.
- Issue signed room-bound `playerSessionToken`.
5. Implement reconnect service:
- Validate token signature + room binding.
- Verify room still active.
- Return latest room snapshot from DO.
6. Implement DO state skeleton:
- Maintain room state snapshot.
- Emit room events on key transitions.
- Support host/player connection registry stubs.
7. Implement timeout transitions for M1:
- `lobby_open` -> `expired` via scheduler/checkpoint.
- host disconnect -> `paused_wait_host` (foundation behavior).
8. Add endpoint-level validation and standardized error shape.
9. Add observability:
- Structured logs with `roomId`, `hostId`, `playerId`, `eventType`.
10. Add automated tests and manual validation checklist coverage.

## Acceptance Criteria
1. Host can log in using pre-generated credentials and receives a valid host session token.
2. Host can create a room only when they do not already own an active room.
3. Room creation returns:
- `roomId`
- join URL payload suitable for QR generation
- initial room snapshot
4. Player can join active room with:
- required name
- optional avatar image/emoji
5. Player receives signed reconnect token and can auto-rejoin while room is active.
6. Reconnect is rejected for inactive/expired/superseded rooms with clear error code.
7. Room lifecycle events are persisted in `room_events` for audit/debug.
8. All endpoints return stable error contracts for auth/validation/state errors.

## Validation Checklist
- [x] Lint/typecheck pass for changed code.
- [ ] Unit tests for token validation and active-room guard.
- [x] Integration-style smoke run for login -> create room -> join -> reconnect flow.
- [x] Manual: host cannot create second active room.
- [x] Manual: player reconnect restores active room snapshot.
- [x] Manual: join/reconnect fail after session completion (`ROOM_NOT_JOINABLE`/`ROOM_INACTIVE`).

## Validation Evidence (2026-02-22)
1. `npm run lint` and `npm run build` both pass.
2. API smoke flow verified:
- `POST /api/auth/host/login` -> `200`.
- `POST /api/rooms/create` -> `201`.
- second `POST /api/rooms/create` -> `409 HOST_ALREADY_ACTIVE`.
- `POST /api/rooms/:roomId/join` -> `201`.
- `POST /api/rooms/:roomId/reconnect` -> `200`.
3. Ended room behavior verified:
- `POST /api/rooms/:roomId/end` -> `200 session_completed`.
- reconnect after end -> `409 ROOM_INACTIVE`.
- join after end -> `409 ROOM_NOT_JOINABLE`.

## Rollback Plan
1. Revert route handlers and DO foundation changes.
2. Apply reverse migration (or mark migration as rolled back in deployment plan).
3. Invalidate issued tokens by rotating signing secret if required.
4. Restore previous stable release artifact.

## Risks / Notes
1. Race condition risk on one-active-room enforcement if not transactionally guarded.
2. Token misuse risk if room binding and expiration checks are incomplete.
3. Timeout policy and scheduler behavior must be deterministic across deploys.
4. This task intentionally establishes minimal room states; full lifecycle expansion continues in M2/M3.
