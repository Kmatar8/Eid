# T-0029: Host Login Bootstrap Regression Fix

- Status: done
- Milestone: M1
- PRD Reference: 5.1, 6.1, 10.1, 11, 13, 15

## Objective
Fix host runtime regression where login succeeded but `/host` stayed on `جارٍ تجهيز الغرفة...`, and reduce perceived login/bootstrap latency.

## Scope
### In
1. Stabilize host identity continuity between login token and room creation.
2. Reduce host login path overhead in DB-backed auth flow.
3. Prevent infinite room bootstrap retries when create-room fails.
4. Add fail-fast behavior for shared store DO sync calls.

### Out
1. Redesign of room state architecture.
2. Changes to ecommerce CSV format/columns.
3. Changes to DB credential business rules (2-month activation policy remains as-is).

## Dependencies
1. T-0028 DB-backed credential auth (`host_access_codes`).
2. Existing shared store sync module (`lib/server/store-sync.ts`).
3. Existing host room bootstrap flow (`app/host/page.tsx`).

## Implementation plan
1. Update login route to use D1 auth path without shared-store sync overhead.
2. Use deterministic host ID derived from code in signed host token.
3. Ensure host session record is created from token before `createRoomForHost`.
4. Add fail-fast timeout + namespace caching for shared store sync fetches.
5. Stop auto-retrying room bootstrap forever after a create-room error.
6. Validate with local preview login/create timings and build checks.

## Acceptance criteria
1. Host login returns token and host identity successfully with DB-backed credentials.
2. `POST /api/rooms/create` no longer fails with `HOST_NOT_FOUND` immediately after login.
3. Host page no longer loops indefinitely on bootstrap failure.
4. Build and targeted lint checks pass.

## Validation checklist
- [x] Targeted lint completed (warnings only in existing host page).
- [x] `npm run build` passes.
- [x] Manual API: login returns 200.
- [x] Manual API: create-room returns 201 after login with same token.

## Rollback plan
1. Revert login route to previous store-upsert path.
2. Revert create-room host-session ensure step.
3. Revert store-sync timeout/cache changes.
4. Revert bootstrap retry-block change in host page.

## Notes/risks
1. First request in local preview can still include one-time cold-start overhead.
2. Shared-store sync is best-effort; fail-fast favors responsiveness if DO sync backend is unreachable.
