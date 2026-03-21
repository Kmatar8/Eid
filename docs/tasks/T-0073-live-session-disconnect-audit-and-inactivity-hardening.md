# T-0073: Live Session Disconnect Audit + Inactivity Hardening

- Status: done
- Milestone: M5
- PRD Reference: 7.2, 7.3, 9, 11, 14, 15 (M5)

## Objective
Audit the reported March 20 live-session disconnect and harden room inactivity handling so active sessions do not silently expire during normal play windows.

## Scope
### In
1. Audit yesterday's production telemetry for a disconnect pattern.
2. Update PRD timeout policy if the audit shows the current lifecycle is too aggressive for live sessions.
3. Harden runtime inactivity detection so ongoing room activity can keep a live session alive even if host-only presence briefly goes stale.
4. Preserve the paused/resume lifecycle for genuinely abandoned rooms.
5. Run scoped validation and record evidence.

### Out
1. New schema migrations.
2. New admin UI surfaces.
3. Full room-event persistence redesign beyond what is needed for this fix.

## Dependencies
1. `PRD.md`
2. `lib/server/store.ts`
3. Existing host background heartbeat hardening in `app/host/page.tsx`
4. Remote D1 `activity_snapshots` telemetry

## API / Contract Impact
1. No new API routes or action types.
2. Existing `host.heartbeat` and `player.heartbeat` continue to drive presence signals.
3. Room inactivity semantics change: active controller traffic is now allowed to keep a room alive during live play.

## Data Model Impact
1. D1: no schema change.
2. Runtime/DO: inactivity detection uses latest room activity instead of host-only activity.
3. R2: no impact.

## Implementation Plan
1. Record audit evidence from production telemetry.
2. Update `PRD.md` timeout language to match the hardened policy.
3. Adjust server inactivity constants and pause trigger logic in `lib/server/store.ts`.
4. Run lint, typecheck, build, and a focused timeout simulation.
5. Update task evidence and mark status.

## Acceptance Criteria
1. Audit evidence identifies whether the reported disconnect matches the current inactivity lifecycle.
2. Active non-lobby rooms do not pause/expire solely because host-only presence goes stale while room activity is still happening.
3. The effective non-lobby idle teardown window is longer than the previous `30 minute` total path.
4. Paused/resume behavior remains intact for rooms with no meaningful activity.
5. Scoped lint, typecheck, build, and timeout simulation pass.

## Validation Checklist
- [x] Production telemetry audit recorded.
- [x] PRD timeout policy updated.
- [x] Runtime inactivity logic hardened.
- [x] Lint/typecheck/build pass.
- [x] Timeout simulation pass.

## Validation Evidence
1. Production telemetry audit from remote D1 `activity_snapshots` for Riyadh local time `2026-03-20 14:00:34` -> `15:00:35`:
   - `14:00:34`: `rooms_active = 1`, `rooms_assigned = 1`, `hosts_present = 1`, `hosts_stale = 0`
   - `14:15:35`: `rooms_active = 1`, `rooms_assigned = 1`, `hosts_present = 0`, `hosts_stale = 1`
   - `14:30:35`: `rooms_active = 1`, `rooms_assigned = 1`, `hosts_present = 0`, `hosts_stale = 1`
   - `14:45:35`: `rooms_active = 0`, `rooms_assigned = 1`, `hosts_present = 0`, `hosts_stale = 1`
   - `15:00:35`: `rooms_active = 0`, `rooms_assigned = 0`, `hosts_present = 0`, `hosts_stale = 0`
   - This matches the previous `10m inactivity + 20m pause grace` teardown path.
2. Additional production telemetry query found windows where `hosts_present = 0` while `controllers_active > 0`, confirming that live controller traffic can continue after host-only presence becomes stale and should not by itself trigger teardown.
3. `PRD.md` updated so active non-lobby inactivity uses a `30 minute` threshold refreshed by room activity, with a `30 minute` `paused_wait_host` grace.
4. `lib/server/store.ts` updated to:
   - increase `HOST_INACTIVITY_MS` from `10` to `30` minutes,
   - increase `HOST_PAUSE_GRACE_MS` from `20` to `30` minutes,
   - base pause detection on `getLatestRoomActivityAt(...)` so host activity or controller-driven room activity can keep the session alive.
5. Validation commands:
   - `npx eslint app/host/page.tsx 'app/controller/[roomId]/page-client.tsx' lib/server/store.ts` ✅ (warnings only, no errors)
   - `npx tsc --noEmit` ✅
   - `npm run build` ✅
6. Timeout simulation:
   - `npx --yes tsx .tmp-live-disconnect-audit.ts` ✅
   - Output summary:
     - `no_activity`: `teams_ready` -> `paused_wait_host` at `31m` -> `expired` at `86m`
     - `player_active`: controller heartbeat at `20m` keeps room `teams_ready` through `31m`, then room pauses later at `55m`, then `expired` at `86m`

## Rollback Plan
1. Revert the PRD timeout update.
2. Restore the previous inactivity constants and host-only pause trigger logic in `lib/server/store.ts`.
3. Re-run scoped validation before redeploy.

## Notes / Risks
1. `room_events` in remote D1 are currently empty, so the audit relies on coarse `activity_snapshots` instead of per-room lifecycle events.
2. Extending inactivity protection keeps abandoned rooms around longer, so the policy must remain bounded and compatible with the `4 hour` hard cap.
