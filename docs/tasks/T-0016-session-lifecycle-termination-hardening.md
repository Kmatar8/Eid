# T-0016: Session Lifecycle Termination Hardening

- Status: in_progress
- Milestone: M5 Reliability + Scale
- PRD Reference: 7.2, 9, 12.1, 12.2, 14.2

## Objective
Fix room/session lifecycle edge cases so host and controller clients are correctly terminated or reset when a room becomes inactive (`session_completed`, `expired`, `superseded`), and ensure host can always bootstrap a new room after closing an old one.

## Scope (in/out)
### In
1. Enforce player access checks for room state/events/stream endpoints when room is inactive.
2. Enforce player action rejection when room is inactive.
3. Normalize inactive-room error signaling across reconnect and action/state flows.
4. Update host page lifecycle handling to detach from closed rooms and bootstrap a new room.
5. Update controller page lifecycle handling to clear local player session when room closes/inactivates.

### Out
1. New gameplay features or trivia rules changes.
2. Durable Object protocol redesign.
3. Database schema changes.

## Dependencies
1. `lib/server/store.ts` room lifecycle and action state machine.
2. `app/api/rooms/[roomId]/*` room state/events/reconnect/stream/actions routes.
3. `app/host/page.tsx` and `app/controller/[roomId]/page-client.tsx` client lifecycle behavior.
4. Existing SSE client utility (`lib/client/live-stream.ts`).

## API/events/contracts impacted
1. `GET /api/rooms/[roomId]/state`: players now receive explicit inactive/player-not-found errors when room is not active or session is stale.
2. `GET /api/rooms/[roomId]/events`: same player access enforcement as state route.
3. `GET /api/rooms/[roomId]/stream`: player stream returns `room.error` and closes on inactive rooms/stale player sessions.
4. `POST /api/rooms/[roomId]/actions`: player actions can return `ROOM_NOT_ACTIVE`.
5. `POST /api/rooms/[roomId]/reconnect`: inactive room error normalized to `ROOM_NOT_ACTIVE`.

## Data model impact (D1/DO/R2)
1. D1: no schema changes.
2. DO/in-memory room authority: no schema changes; tighter lifecycle guards in runtime logic.
3. R2: no impact.

## Implementation plan (step-by-step)
1. Add/extend inactive-room guard logic in store action path for player actions.
2. Add player-active-room + player-exists checks to `state`, `events`, and `stream` routes.
3. Normalize reconnect inactive error code.
4. Harden host page termination flow to clear stored `hostRoomId` and trigger fresh room bootstrap after `endSession` or terminal room snapshots.
5. Harden controller page to clear local player session on terminal lifecycle errors (polling/SSE/heartbeat/action paths).
6. Run lint + build and record validation evidence.

## Acceptance criteria
1. Host clicks end session and immediately gets detached from old room; new room can be created/bootstrapped without manual storage cleanup.
2. If room is inactive, controller polling/SSE no longer continues as active; local controller session is cleared and user is forced to rejoin.
3. Player actions on inactive rooms are rejected consistently.
4. Lint/build pass.

## Validation checklist
- [x] Lint pass.
- [x] Build pass.
- [ ] Manual: host can end old room and continue with fresh room without stuck state.
- [ ] Manual: controller connected to closed room is terminated and cannot continue until rejoin.

## Validation evidence
1. `npm run lint` passed with warnings only (no errors).
2. `npm run build` passed; dynamic routes include updated `state/events/reconnect/actions/stream` room endpoints.
3. Host lifecycle now clears local `hostRoomId` when room enters terminal state and re-bootstrap path is triggered.
4. Player lifecycle guard added at store + route level to reject inactive rooms and stale player sessions.

## Rollback plan
1. Revert changes in store/action inactive checks.
2. Revert route-level player inactive guards.
3. Revert host/controller lifecycle client handling.
4. Restore previous behavior (not recommended due stale session risks).

## Notes/risks
1. Existing stale player tokens will terminate more aggressively; this is expected and desired.
2. Host UI now auto-detaches from terminal rooms, so local view resets quickly after closure.
