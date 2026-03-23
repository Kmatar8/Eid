# T-0075: Room-Not-Found Join + Session Resilience Hardening

- Status: done
- Milestone: M5
- PRD Reference: 7.3, 9, 11, 12, 14

## Objective
Eliminate transient `ROOM_NOT_FOUND` failures during join/lobby play by hardening room-shard sync fallback and preventing immediate host/controller teardown on short-lived lookup mismatches.

## Scope
### In
1. Ensure newly created rooms are persisted to room-scoped store immediately after creation.
2. Add room-scoped store fallback so routes can recover from shard misses using shared-store hydration.
3. Add bounded host/client grace handling for transient lookup errors (`ROOM_NOT_FOUND`, `HOST_ROOM_MISMATCH`, `PLAYER_NOT_FOUND`) instead of immediate forced reset.
4. Keep terminal handling immediate for true auth and inactive-room states.
5. Update stream fatality policy so transient lookup misses reconnect instead of hard-stop.

### Out
1. Infinite session guarantees (hard cap and explicit terminal states still apply).
2. Full persistence redesign of per-room event logs in D1.
3. Any gameplay-rule changes for Trivia/Haraj.

## Dependencies
1. `PRD.md`
2. `lib/server/store-sync.ts`
3. `app/api/rooms/create/route.ts`
4. `app/host/page.tsx`
5. `app/controller/[roomId]/page-client.tsx`
6. `lib/client/live-stream.ts`
7. `lib/client/live-api.ts`

## Implementation plan (step-by-step)
1. Update PRD reconnect behavior to require retry/grace for transient room lookup failures.
2. Patch room creation API to persist the created room shard immediately (room-scoped durability warm-up).
3. Patch room-scoped store sync flow to hydrate shared store when a room shard lookup misses, then heal shard persistence on success.
4. Patch host runtime to avoid instant room reset on first room-lookup mismatch; use bounded miss counter + grace window.
5. Patch controller runtime to avoid instant session termination on first lookup mismatch; use bounded miss counter + grace window.
6. Patch SSE client fatal criteria so lookup-miss errors are reconnectable.
7. Run lint/typecheck/build and record evidence.

## Acceptance criteria
1. A host-created room remains joinable immediately after creation under room-scoped store mode.
2. Transient lookup misses no longer instantly force host room reset or controller termination.
3. Terminal inactive-room and auth errors still terminate flows as expected.
4. No regression on existing host/controller lifecycle actions.
5. Lint/typecheck/build pass.

## Validation checklist
- [x] PRD updated.
- [x] Server sync hardening implemented.
- [x] Host grace handling implemented.
- [x] Controller grace handling implemented.
- [x] Stream reconnect policy updated for lookup misses.
- [x] `npx eslint app/host/page.tsx 'app/controller/[roomId]/page-client.tsx' app/api/rooms/create/route.ts lib/server/store-sync.ts lib/client/live-stream.ts` passes.
- [x] `npx tsc --noEmit` passes.
- [x] `npm run build` passes.

## Validation evidence
1. `PRD.md` updated to require bounded retry/grace handling for transient `ROOM_NOT_FOUND`-class lookup failures before treating them as terminal.
2. `app/api/rooms/create/route.ts` now persists the room shard immediately after successful room creation (`persistRoomShardToDurable(created.room.id)`), reducing first-join shard miss windows.
3. `lib/server/store-sync.ts` now adds room-scoped fallback hydration from shared store when room shard lookup misses (`withRoomShardStore` path), preventing transient `ROOM_NOT_FOUND` caused by shard sync lag.
4. `app/host/page.tsx` now applies bounded lookup-miss grace (`12s` / `4` misses) before releasing room binding; transient lookup failures no longer instantly reset host to a new room.
5. `app/controller/[roomId]/page-client.tsx` now applies bounded lookup-miss grace (`12s` / `4` misses) before terminating controller session; transient lookup failures no longer instantly kick players.
6. `lib/client/live-stream.ts` no longer treats `ROOM_NOT_FOUND` / `HOST_ROOM_MISMATCH` / `PLAYER_NOT_FOUND` as fatal stream failures; stream reconnect flow handles transient lookup mismatches.
7. `lib/client/live-api.ts` includes enriched timeout details (`path`, method, retry attempt, visibility/online state, payload bytes) for diagnosing request timeouts that can appear as disconnect symptoms under weak networks.
8. Validation commands:
   - `npx eslint app/host/page.tsx 'app/controller/[roomId]/page-client.tsx' app/api/rooms/create/route.ts lib/server/store-sync.ts lib/client/live-stream.ts` ✅ (warnings only for existing `<img>` usage in host page)
   - `npx tsc --noEmit` ✅
   - `npm run build` ✅

## Rollback plan
1. Revert `withRoomShardStore` fallback to previous behavior.
2. Revert host/controller lookup-grace logic to prior immediate-termination behavior.
3. Revert stream fatal policy and room-create shard warm-up.
4. Re-run validation before redeploy.

## Notes/risks
1. This hardening targets transient lookup/routing races and sync lag; true terminal room states still end sessions by design.
2. Bounded grace windows must stay short enough to avoid masking genuine terminal or ownership issues.
3. If room-scoped DO storage is unavailable for prolonged periods, behavior falls back to shared-store hydration best effort.
