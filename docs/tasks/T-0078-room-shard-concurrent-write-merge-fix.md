# T-0078: Room Shard Concurrent Write Merge Fix

- Status: done
- Milestone: M5 Reliability + Scale
- PRD Reference: 3, 7.3, 9, 10.1, 11, 13

## Objective
Prevent cross-instance room-shard writes from dropping joined players or regressing active room state when multiple processes persist the same room concurrently.

## Scope (in/out)
### In
1. Reproduce and document the deployed concurrent-join player-loss failure mode.
2. Harden room-scoped Durable Object persistence so concurrent room snapshot writes merge safely instead of last-write-wins overwriting.
3. Add focused regression coverage for divergent room shard snapshots produced from the same base room.
4. Re-run scoped validation and soak verification after the persistence fix.

### Out
1. Full Durable Object authority migration from the current hybrid snapshot model.
2. New gameplay features or room lifecycle policy changes.
3. D1 or R2 schema changes.

## Dependencies
1. `PRD.md`
2. `lib/server/store-sync.ts`
3. `workers/room-do/worker.mjs`
4. `lib/server/store.ts`
5. Existing room routes using `withRoomShardStore(...)`

## API/events/contracts impacted
1. No new public API routes.
2. Room-scoped Durable Object `/state` persistence semantics change from blind overwrite to merge-on-write for room shard snapshots.
3. Existing room snapshot contract remains compatible for host/controller clients.

## Data model impact (D1/DO/R2)
1. D1: no schema changes.
2. DO/runtime snapshot storage now preserves the union of concurrent room shard mutations where safe, while still preferring fresher structural room state.
3. R2: no impact.

## Implementation plan (step-by-step)
1. Capture the deployed failure and identify the last-write-wins room shard persistence path.
2. Implement room shard merge logic inside the room Durable Object write path so divergent concurrent snapshots are reconciled safely.
3. Add a regression script/test covering concurrent joins and stale-vs-newer room writes.
4. Run lint/typecheck/build plus targeted regression verification.
5. Re-run the multi-controller soak to confirm players are no longer dropped and record evidence.

## Acceptance criteria
1. Concurrent room shard writes from separate instances do not drop already-joined players.
2. Newer structural room state still wins over older snapshots while preserving non-conflicting participant/session data.
3. Targeted validation passes, including a concurrent-join style regression and live soak verification.

## Validation checklist
- [x] Root cause documented.
- [x] Room DO merge persistence implemented.
- [x] Regression coverage added.
- [x] Scoped validation passed.
- [x] Multi-controller soak passed.

## Validation evidence
1. Root cause:
   - Concurrent room-shard `/state` writes in `workers/room-do/worker.mjs` were last-write-wins, so divergent snapshots produced from the same base room could overwrite joined players or fresher activity/state.
   - The deployed app was still on the legacy shared-store path until `HROOF_ROOM_SCOPED_DO_STORE=true` was enabled in `wrangler.jsonc`, so the room-shard fix had to be rolled out with that flag for production traffic to exercise the new path.
2. Implementation:
   - Added merge-on-write room snapshot reconciliation in `workers/room-do/state-merge.mjs` and wired it into `workers/room-do/worker.mjs`.
   - Updated `lib/server/store-sync.ts` so room-shard persists import the merged snapshot returned by the DO and retry until the latest local revision is actually persisted.
   - Added `scripts/verify-room-shard-concurrent-write-merge.mjs` to cover divergent concurrent join/write snapshots.
3. Scoped validation:
   - `node scripts/verify-room-shard-concurrent-write-merge.mjs` -> `verify-room-shard-concurrent-write-merge: ok`
   - `npx eslint lib/server/store-sync.ts workers/room-do/worker.mjs workers/room-do/state-merge.mjs scripts/verify-room-shard-concurrent-write-merge.mjs`
   - `npx tsc --noEmit`
   - `npm run build`
   - `npm run build:worker`
4. Deployment:
   - Room DO worker deployed as `hroof-room-do`, version `f0ec089f-ecae-4e65-9099-386f3b4d6a64`.
   - App worker deployed to `https://hroof-app.k-matar.workers.dev`, version `aa2a0007-89b9-4cb4-9772-b739f36e8468`, with `env.HROOF_ROOM_SCOPED_DO_STORE ("true")`.
5. Remote verification:
   - Immediate join diagnostic after rollout: host state stabilized at `playerCount=20` and all `20/20` controller state reads returned `200`.
   - 10-minute deployed soak against `https://hroof-app.k-matar.workers.dev` with `1` host and `20` controllers completed without failures.
   - Soak result:
     - duration: `601s`
     - room: `room_576afc1f-cc62-4029-99b7-006bc0d7c6c4`
     - host state polls: `301`
     - host heartbeats: `59`
     - controller state polls: `2420`
     - controller heartbeats: `1200`
     - reconnect checks: `190`
     - clue selections: `30`
     - submitted answers: `53`
     - next-question calls: `30`
     - final state before cleanup: `between_games`
     - final player count before cleanup: `20`
     - failures: `0`

## Rollback plan
1. Revert the room DO merge-on-write behavior to the previous overwrite semantics.
2. Revert the concurrent-write regression coverage.
3. Re-run scoped validation before redeploy.

## Notes/risks
1. Merge rules must not hide legitimate newer room-state transitions such as completion, pause, or active game changes.
2. Equal-version snapshots can still diverge under concurrent writes, so player/session unions must be conservative and deterministic.
3. This fix reduces data loss in the current hybrid snapshot architecture but does not replace the longer-term PRD-aligned goal of a fully authoritative per-room Durable Object runtime.
