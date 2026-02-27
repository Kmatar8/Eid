# T-0006: Live E2E Testing Surface (Host/Join/Controller/Room)

- Status: done
- Milestone: M4
- PRD Reference: 5, 6, 8, 9, 12, 14

## Objective
Enable full live end-to-end testing of the current game flow by delivering the missing runtime-facing routes (`/host`, `/join/:roomId`, `/controller/:roomId`, `/room/:roomId`) and a repeatable deployed smoke test script.

## Scope
### In
1. Host web route for login, room creation, room state polling, and host actions.
2. Player join route for room join and player token issuance handling.
3. Controller route for player reconnect hydration, heartbeat, responder-only answer submission, and state visibility.
4. Host display route for live scoreboard/question state visibility.
5. Shared client API helpers for protocol envelope + auth handling.
6. Deployed smoke script for login/create/join/actions/reconnect/end validation.
7. Documentation updates in this task with concrete validation evidence.

### Out
1. Durable Object migration of authoritative room state.
2. Production-hard realtime websocket transport and hibernation tuning.
3. New game modes beyond current trivia flow.
4. Cross-instance state consistency guarantees beyond current in-memory backend.

## Dependencies
1. Existing API routes from `T-0001`..`T-0004` remain compatible.
2. Token contracts in `lib/server/token.ts` remain stable for host/player auth.
3. Deployed environment with stable `HROOF_TOKEN_SECRET` and host seed credentials.

## API / Contract Impact
1. Uses existing endpoints (no contract break):
- `POST /api/auth/host/login`
- `POST /api/rooms/create`
- `POST /api/rooms/:roomId/join`
- `POST /api/rooms/:roomId/reconnect`
- `POST /api/rooms/:roomId/actions`
- `GET /api/rooms/:roomId/state`
- `GET /api/rooms/:roomId/events?since=`
- `POST /api/rooms/:roomId/end`
2. Uses protocol action types:
- `host.lockLobby`, `host.startTeams`, `host.startTrivia`, `host.nextQuestion`, `host.endSession`
- `player.heartbeat`, `player.submitAnswer`

## Data Model Impact
1. D1: no schema change.
2. DO: no binding/schema change in this task.
3. R2: no impact.

## Implementation Plan
1. Add task-scoped client utilities for auth/session persistence and API calls.
2. Implement `/host` with login/create room/action controls and room polling.
3. Implement `/join/[roomId]` and persist player token/session info.
4. Implement `/controller/[roomId]` reconnect + heartbeat + responder-only submit flow.
5. Implement `/room/[roomId]` host display with live state and scores.
6. Add `scripts/smoke-live.sh` for deployed API regression flow.
7. Run lint/build, capture evidence, and finalize task status.

## Acceptance Criteria
1. Host can login, create room, and execute lifecycle actions from `/host`.
2. Player can join from `/join/:roomId` and continue at `/controller/:roomId`.
3. Controller page shows active responder state and only allows valid answer submission.
4. Host display (`/room/:roomId`) reflects live room/team/trivia updates via polling.
5. Reconnect from controller succeeds while room is active.
6. Smoke script runs against deployed domain and validates core flow statuses.

## Validation Checklist
- [x] Lint/typecheck pass.
- [x] Build pass.
- [x] Manual scenario: host create room -> players join -> lock/start teams/start trivia -> answer -> next question -> end session.
- [x] Manual scenario: controller reconnect restores current state.
- [x] Script scenario: deployed smoke script reports success.

## Validation Evidence (2026-02-26)
1. Added live routes:
- `app/host/page.tsx`
- `app/join/[roomId]/page.tsx` + `page-client.tsx`
- `app/controller/[roomId]/page.tsx` + `page-client.tsx`
- `app/room/[roomId]/page.tsx` + `page-client.tsx`
2. Added shared client modules:
- `lib/client/live-api.ts`
- `lib/client/live-session.ts`
- `components/live/room-state-panel.tsx`
3. Added runnable smoke script:
- `scripts/smoke-live.sh`
4. Local verification commands:
- `npm run lint` -> exit `0` (warnings only in pre-existing generated files)
- `npm run build` -> success, routes include `/host`, `/join/[roomId]`, `/controller/[roomId]`, `/room/[roomId]`
- `BASE_URL=http://localhost:3005 scripts/smoke-live.sh` -> success through login/create/join/actions/reconnect/end/join-after-end checks.
5. Live deployment verification:
- Deployed to `https://hroof-app.k-matar.workers.dev` (Worker version `751ba0e5-5f94-4a72-b392-16f906496a81`).
- `BASE_URL=https://hroof-app.k-matar.workers.dev scripts/smoke-live.sh` -> success through full lifecycle flow and join-after-end rejection.
6. Runtime compatibility hardening:
- Updated PBKDF2 iteration handling in `lib/server/password.ts` to satisfy Cloudflare max supported iteration limits and avoid production login 500s.
7. Cross-isolate live consistency hardening:
- Added shared store synchronization through Durable Object snapshot persistence (`lib/server/store-sync.ts`) and wrapped room/auth API handlers with `withSharedStore(...)`.
- Added store export/import serialization for Map/Set rich state in `lib/server/store.ts`.
- Verified live smoke flow success after redeploy (`Current Version ID: 7b460ea8-3756-4c8f-9c7a-b1a507a65552`).

## Rollback Plan
1. Remove newly added app routes (`/host`, `/join/[roomId]`, `/controller/[roomId]`, `/room/[roomId]`).
2. Remove shared client helpers and smoke script.
3. Revert task status and board entry to previous state.
4. Keep API contracts unchanged so previous smoke-only validation remains possible.

## Notes / Risks
1. Current backend room state is in-memory and may reset on cold starts/restarts.
2. Cross-instance consistency is not guaranteed until authoritative DO/D1 integration is completed.
3. Polling frequency trades off responsiveness vs Worker invocation costs.
4. Task is intended to unblock live functional testing, not reliability hardening completion.
