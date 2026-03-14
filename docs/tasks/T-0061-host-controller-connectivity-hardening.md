# T-0061: Host/Controller Connectivity Hardening

- Status: done
- Milestone: M5
- PRD Reference: 3, 6, 7.2, 9, 11, 13

## Objective
Reduce host/controller desynchronization and forced disconnects caused by stale room snapshots, reconnect races, and brittle stream recovery so active rooms stay usable through transient network and isolate drift conditions.

## Scope
### In
1. Audit host/controller live state delivery across polling, SSE, reconnect, and room-scoped store synchronization.
2. Fix concrete server/client bugs that can leave host and controllers on divergent room state or incorrectly terminate valid sessions.
3. Harden reconnect/recovery behavior so transient snapshot misses do not eject active participants.
4. Add regression coverage for the identified connectivity paths.

### Out
1. New gameplay features or scoring changes.
2. Full transport migration away from SSE/polling.
3. Schema or migration changes unless required for a connectivity fix.

## Dependencies
1. `PRD.md`
2. `lib/client/live-api.ts`
3. `lib/client/live-stream.ts`
4. `app/host/page.tsx`
5. `app/controller/[roomId]/page-client.tsx`
6. `app/api/rooms/[roomId]/stream/route.ts`
7. `app/api/rooms/[roomId]/state/route.ts`
8. `app/api/rooms/[roomId]/reconnect/route.ts`
9. `lib/server/store-sync.ts`
10. `lib/server/store.ts`

## API / Events / Contracts Impacted
1. `GET /api/rooms/[roomId]/stream`
2. `GET /api/rooms/[roomId]/state`
3. `POST /api/rooms/[roomId]/reconnect`
4. Existing `room.state` / `room.error` SSE semantics
5. Existing auth/session error codes used by host and controller clients

## Data Model Impact (D1/DO/R2)
1. D1: no schema changes expected.
2. DO: room shard snapshot synchronization behavior may be adjusted, but no state shape changes are planned.
3. R2: no changes.

## Implementation plan (step-by-step)
1. Reproduce and isolate connectivity risks in stream/state/reconnect flow and room-shard synchronization.
2. Patch server-side freshness/authorization behavior where valid participants can be treated as disconnected due to stale snapshots.
3. Patch client recovery behavior where host/controllers can remain stale or surface terminal errors too aggressively.
4. Add focused regression tests for the affected server logic.
5. Run lint, typecheck, and affected tests; capture evidence here.

## Acceptance criteria
1. Active hosts/controllers do not get incorrectly disconnected during transient room-shard sync lag.
2. Host and controllers converge back to the latest room state after transient stream disruption without manual recovery.
3. Player reconnect remains valid while the room is active even if a stale snapshot briefly omits the player.
4. Affected checks pass (`lint`, `typecheck`, and targeted tests).

## Validation checklist
- [x] `npx eslint app/host/page.tsx 'app/controller/[roomId]/page-client.tsx' 'app/api/rooms/create/route.ts' 'app/api/rooms/[roomId]/stream/route.ts' 'app/api/rooms/[roomId]/state/route.ts' 'app/api/rooms/[roomId]/reconnect/route.ts' lib/client/room-snapshot.ts lib/client/live-stream.ts lib/server/store-sync.ts lib/server/store.ts scripts/test-connectivity-hardening.ts`
- [x] `npx tsc --noEmit`
- [x] Affected automated tests for stream/state/reconnect hardening
- [ ] Manual-ready scenario: host + controller recover after transient stream interruption.
- [ ] Manual-ready scenario: active controller is not ejected by brief stale snapshot/player-miss conditions.

## Rollback plan
1. Revert the connectivity hardening commit(s) for stream/state/reconnect handling.
2. Restore prior client/session recovery behavior.
3. Re-run affected checks to verify rollback state.

## Notes/risks
1. Over-correcting terminal session handling can mask legitimate revocation; auth errors must remain terminal.
2. Cross-isolate consistency improvements may trade minor latency for correctness.
3. Stream and polling paths must stay consistent to avoid split-brain client behavior.

## Validation evidence (2026-03-14)
1. Connectivity faults addressed:
   - `app/api/rooms/create/route.ts`
   - `lib/server/store-sync.ts`
   - `lib/server/store.ts`
   - `app/api/rooms/[roomId]/state/route.ts`
   - `app/api/rooms/[roomId]/reconnect/route.ts`
   - `app/api/rooms/[roomId]/stream/route.ts`
   - `app/host/page.tsx`
   - `app/controller/[roomId]/page-client.tsx`
   - `lib/client/room-snapshot.ts`
2. Server-side hardening:
   - room creation now seeds room-scoped shard persistence when the room-sharded path is enabled
   - room-shard hot-path hydration now falls back to shared-store hydration when a room shard is missing on a fresh isolate
   - forced room-shard refresh is used before returning `ROOM_NOT_FOUND`, `HOST_ROOM_MISMATCH`, or `PLAYER_NOT_FOUND` on state/reconnect/stream auth paths
   - stale incoming room-shard snapshots are rejected instead of overwriting newer local state
   - stream hub ignores regressive snapshot versions instead of rewinding live subscribers
3. Client-side hardening:
   - host/controller pages now apply monotonic room snapshot updates and ignore older room versions
4. Regression coverage:
   - added `scripts/test-connectivity-hardening.ts`
   - covers stale shard import rejection and client monotonic snapshot preference
5. Validation commands:
   - `npx eslint app/host/page.tsx 'app/controller/[roomId]/page-client.tsx' 'app/api/rooms/create/route.ts' 'app/api/rooms/[roomId]/stream/route.ts' 'app/api/rooms/[roomId]/state/route.ts' 'app/api/rooms/[roomId]/reconnect/route.ts' lib/client/room-snapshot.ts lib/client/live-stream.ts lib/server/store-sync.ts lib/server/store.ts scripts/test-connectivity-hardening.ts` ✅ (warnings only in pre-existing host UI code, no errors)
   - `npx tsc --noEmit` ✅
   - `npx --yes tsx scripts/test-connectivity-hardening.ts` ✅
