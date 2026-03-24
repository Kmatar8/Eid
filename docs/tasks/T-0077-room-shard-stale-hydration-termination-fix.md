# T-0077: Room Shard Stale Hydration Termination Fix

- Status: done
- Milestone: M5 Reliability + Scale
- PRD Reference: 7.2, 7.3, 9, 10.1, 11, 15

## Objective
Prevent active rooms from being falsely terminated when a process hydrates an older room-shard snapshot and regresses the room lifecycle state or activity timestamps.

## Scope (in/out)
### In
1. Audit room-shard hydration/import behavior for stale snapshot overwrite risk.
2. Guard room-shard imports so older snapshots cannot replace newer in-memory room data.
3. Add regression coverage for stale hydration against an active live room.
4. Run scoped validation and record evidence.

### Out
1. Broad realtime architecture redesign.
2. New gameplay features or room lifecycle policy changes.
3. D1 or R2 schema changes.

## Dependencies
1. `lib/server/store.ts`
2. `lib/server/store-sync.ts`
3. Existing host/controller lifecycle handling in `app/host/page.tsx` and `app/controller/[roomId]/page-client.tsx`

## API/events/contracts impacted
1. No new routes or actions.
2. Room-scoped store hydration semantics change: stale shard snapshots are ignored instead of overwriting fresher local room state.

## Data model impact (D1/DO/R2)
1. D1: no schema changes.
2. DO/runtime snapshot sync: import path gains stale-snapshot guardrails using room version and timestamps.
3. R2: no impact.

## Implementation plan (step-by-step)
1. Add the task entry and capture the suspected stale-hydration failure mode.
2. Patch room-shard import logic to compare incoming room freshness against local room state before replacing room-scoped data.
3. Add a focused regression test/simulation covering an active room plus an older shard snapshot.
4. Run scoped lint/typecheck/build/test validation.
5. Record validation evidence and mark task done if acceptance criteria pass.

## Acceptance criteria
1. Hydrating an older room-shard snapshot does not regress a fresher in-memory room state.
2. Active rooms are not falsely expired or terminated after stale shard hydration.
3. Scoped validation covering the regression passes.

## Validation checklist
- [x] Stale hydration guard implemented.
- [x] Regression coverage added.
- [x] Scoped lint/typecheck/build/test validation passed.
- [x] Validation evidence recorded.

## Validation evidence
1. Root cause found in `lib/server/store.ts`: `importRoomShardSnapshot(...)` replaced local room-scoped state unconditionally, so an older durable snapshot could regress a live room's `updatedAt` / `hostLastSeenAt` and trigger false inactivity pause/termination on the next `getRoom(...)` timeout check.
2. `lib/server/store.ts` now compares incoming shard freshness against the current in-memory room before replacing state:
   - newer `room.version` still imports,
   - equal-version snapshots are accepted only if their latest activity timestamp (`updatedAt` / `hostLastSeenAt`) is not older than the current local room,
   - missing-room shard payloads are ignored when a local room already exists.
3. Added `scripts/verify-room-shard-stale-hydration.ts` to simulate the two regression paths that previously could falsely terminate live rooms:
   - newer controller/player activity with unchanged room version,
   - newer host heartbeat activity with unchanged room version.
4. Validation commands:
   - `npx eslint lib/server/store.ts scripts/verify-room-shard-stale-hydration.ts` ✅
   - `npx tsc --noEmit` ✅
   - `npx --yes tsx scripts/verify-room-shard-stale-hydration.ts` ✅
   - `npm run build` ✅

## Rollback plan
1. Revert the room-shard stale import guard.
2. Revert the regression coverage changes.
3. Re-run scoped validation to confirm previous behavior is restored.

## Notes/risks
1. The fix must avoid blocking legitimate newer shard hydration on cold processes.
2. Freshness checks should prefer room version first and use timestamps as a fallback to avoid masking valid state progression.
