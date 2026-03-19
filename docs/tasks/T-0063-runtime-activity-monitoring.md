# T-0063: Runtime Activity Monitoring

- Status: done
- Milestone: M5
- PRD Reference: 10.1, 10.2, 11, 14

## Objective
Add a safe monitoring tool to inspect current runtime activity counts for active hosts, active rooms, and active controllers using the authoritative live store and heartbeat timestamps already used by the app.

## Scope
### In
1. Define operational activity counts for rooms, hosts, and controllers from current runtime state.
2. Add a protected monitoring API surface that reads the live shared/room-scoped store.
3. Add a local CLI watcher tool that can poll the monitoring API for local or deployed environments.
4. Document required auth/usage and validation evidence.

### Out
1. Public unauthenticated admin dashboards.
2. New database schema or migrations.
3. Historical analytics or charts beyond current activity snapshot polling.

## Dependencies
1. `PRD.md`
2. `wrangler.jsonc`
3. `lib/server/store.ts`
4. `lib/server/store-sync.ts`
5. `lib/server/types.ts`
6. `app/api/`
7. `scripts/`

## API / Events / Contracts Impacted
1. New protected admin monitoring endpoint for runtime activity summary.
2. Existing host/player heartbeat semantics remain unchanged.

## Data Model Impact (D1/DO/R2)
1. D1: no schema changes.
2. DO: read-only use of existing shared/room-scoped snapshots.
3. R2: no changes.

## Implementation plan (step-by-step)
1. Add server helper(s) that hydrate the current runtime store and compute activity counts from active room state plus heartbeat timestamps.
2. Add a protected API route that returns summary metrics and per-room breakdown.
3. Add a CLI script that polls the API and prints live counts in a readable format.
4. Validate with lint, typecheck, and manual CLI/API verification.
5. Record auth/usage notes and validation evidence here.

## Acceptance criteria
1. An authenticated operator can retrieve current counts for active rooms, active hosts, and active controllers.
2. Counts are derived from the same live runtime state used by room actions/streams, not stale static config.
3. The monitor exposes enough per-room detail to explain the summary counts.
4. New monitoring surface is not publicly accessible without admin credentials.
5. Affected checks pass.

## Validation checklist
- [x] `npx eslint app/api/admin/activity/route.ts lib/server/activity-monitor.ts lib/server/store.ts scripts/monitor-activity.mjs app/host/login/page.tsx`
- [x] `npx tsc --noEmit`
- [x] Manual: local API call with valid token returns summary + room breakdown.
- [x] Manual: CLI watcher prints counts for a target base URL.

## Rollback plan
1. Remove the admin activity API route and CLI script.
2. Revert store helper exports added for monitoring.
3. Remove documentation/usage notes for the monitor.

## Notes/risks
1. Runtime monitoring must remain read-only and must not mutate room state.
2. “Active” must be defined clearly because room-active state and heartbeat-present state are not identical.
3. Cross-isolate room-scoped storage means the monitor must hydrate room shards before counting per-room presence.

## Validation evidence (2026-03-19)
1. Monitoring surface added:
   - Added protected runtime summary helper in `lib/server/activity-monitor.ts`.
   - Added authenticated endpoint `GET /api/admin/activity`.
   - Added CLI watcher `scripts/monitor-activity.mjs` and npm alias `npm run monitor:activity`.
2. Activity definitions:
   - `rooms.active` counts room assignments whose current state is still one of the active room states after runtime hydration.
   - `hosts.present` counts assigned rooms whose host heartbeat age is within the configured host presence threshold.
   - `controllers.activeInActiveRooms` counts joined players in active rooms whose `lastSeenAt` is within the configured controller presence threshold.
3. Local auth/API validation:
   - Started local dev server with `PORT=3007 HROOF_ACTIVITY_MONITOR_TOKEN=monitor-test npm run dev`.
   - `curl -H 'authorization: Bearer monitor-test' http://localhost:3007/api/admin/activity` ✅ returned a valid JSON summary payload.
   - `curl http://localhost:3007/api/admin/activity` ✅ returned `401`.
4. CLI validation:
   - `HROOF_ACTIVITY_MONITOR_TOKEN=monitor-test node scripts/monitor-activity.mjs --base-url http://localhost:3007` ✅ printed the summary snapshot.
5. Build/quality validation:
   - `npx eslint app/api/admin/activity/route.ts lib/server/activity-monitor.ts lib/server/store.ts scripts/monitor-activity.mjs app/host/login/page.tsx` ✅
   - `npx tsc --noEmit` ✅
   - `npm run build` ✅
6. Branch prerequisite:
   - Cherry-picked `fix(T-0062): fix host login prerender build` because `main` still failed `npm run build` on `/host/login` without that existing fix.
