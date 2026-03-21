# T-0072: Host Background Liveness Hardening

- Status: done
- Milestone: M5
- PRD Reference: 7.3, 9, 14, 15 (M5)

## Objective
Prevent active rooms from expiring during long-running live sessions just because the host page is backgrounded or visibility-throttled for an extended period.

## Scope
### In
1. Keep host liveness refreshed while the host page is hidden/backgrounded using a lower-frequency heartbeat strategy.
2. Preserve current visible-page heartbeat cadence for active play.
3. Avoid turning hidden-page protection into high-frequency request pressure.
4. Ensure long-running sessions do not silently roll into a new room after background visibility loss alone.

### Out
1. PRD timeout policy changes.
2. Controller liveness policy changes.
3. New monitoring dashboards.

## Dependencies
1. `app/host/page.tsx`
2. Existing host inactivity policy in `lib/server/store.ts`
3. Existing latency hardening constraints from T-0012.

## API / Contract Impact
1. No contract shape changes.
2. Existing `host.heartbeat` action remains the host liveness signal.

## Data Model Impact
1. D1: no change.
2. DO/runtime: no change.
3. R2: no change.

## Implementation Plan
1. Add task tracking for host background-liveness hardening.
2. Update host heartbeat loop to continue in hidden state at a reduced cadence.
3. Keep foreground behavior unchanged.
4. Run scoped lint/typecheck/build and record evidence.

## Acceptance Criteria
1. Hidden/background host page still refreshes host liveness often enough to avoid accidental inactivity expiry.
2. Foreground host page continues to use the current fast heartbeat cadence.
3. No new high-frequency hidden-tab polling loop is introduced.
4. Scoped lint/build pass.

## Validation Checklist
- [x] Hidden host heartbeat cadence implemented.
- [x] Foreground heartbeat cadence preserved.
- [x] No new hidden-state fast polling introduced.
- [x] Scoped lint/build pass.

## Validation Evidence
1. Updated `app/host/page.tsx` to add `HOST_BACKGROUND_HEARTBEAT_MS = 60000` while preserving the existing visible-page `HOST_HEARTBEAT_MS = 10000`.
2. Hidden/background host pages now continue `host.heartbeat` at a low cadence instead of stopping entirely, while state polling/SSE remain visibility-aware to avoid restoring the previous hidden-tab request storm.
3. Validation commands:
   - `npx eslint app/host/page.tsx 'app/controller/[roomId]/page-client.tsx' lib/server/store.ts` ✅ (warnings only, no errors)
   - `npx tsc --noEmit` ✅
   - `npm run build` ✅

## Rollback Plan
1. Restore visibility-gated host heartbeat behavior.
2. Re-run scoped lint/build.

## Notes / Risks
1. Background browser timer throttling varies by platform, so the hidden cadence should stay conservative with margin below the server inactivity threshold.
2. A long-running live session test is still recommended to confirm the issue is fully resolved on the host device/browser used in production.
