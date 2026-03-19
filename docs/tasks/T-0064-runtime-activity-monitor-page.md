# T-0064: Runtime Activity Monitor Page

- Status: done
- Milestone: M5
- PRD Reference: 10.1, 10.2, 11, 14

## Objective
Add a small operator-facing web page that visualizes the existing runtime activity monitor so hosts, rooms, and controllers can be inspected without using `curl` or the CLI.

## Scope
### In
1. Add a read-only web page that calls the protected runtime activity API.
2. Provide token entry, polling controls, summary cards, and a per-room breakdown.
3. Keep the monitor safe by requiring the existing bearer token and by avoiding any mutation paths.
4. Record validation evidence and usage notes.

### Out
1. New backend auth systems or user accounts for admin access.
2. Historical charts or long-term analytics storage.
3. Multi-page admin dashboards beyond the runtime activity monitor.

## Dependencies
1. `PRD.md`
2. `app/api/admin/activity/route.ts`
3. `lib/server/activity-monitor.ts`
4. `components/ui/`
5. `app/`

## API / Events / Contracts Impacted
1. No API contract changes; the page consumes the existing `GET /api/admin/activity` response.
2. No gameplay or room event changes.

## Data Model Impact (D1/DO/R2)
1. D1: no schema changes.
2. DO: no behavior changes; read-only consumption of current runtime activity data.
3. R2: no changes.

## Implementation plan (step-by-step)
1. Add a new task-scoped page route for the runtime monitor.
2. Build a small client UI for token entry, polling controls, summary cards, and room-level inspection.
3. Keep token handling client-side only and same-origin by default.
4. Validate with lint, typecheck, and production build.
5. Update this task with validation evidence and usage notes.

## Acceptance criteria
1. An operator can open a web page and inspect current host, room, and controller activity after providing the monitor bearer token.
2. The page can manually refresh and optionally auto-poll the existing activity API.
3. The page shows enough room-level detail to explain summary counts.
4. The page does not expose data without the existing bearer token.
5. Affected checks pass.

## Validation checklist
- [x] `npx eslint app/admin/activity/page.tsx app/admin/activity/page-client.tsx`
- [x] `npx tsc --noEmit`
- [x] `npm run build`
- [x] Manual: monitor page loads and fetches data with a valid token.

## Rollback plan
1. Remove the `/admin/activity` page route and its client component.
2. Remove task documentation for the web monitor page.
3. Leave the existing API/CLI monitor intact.

## Notes/risks
1. The page is intentionally read-only; it must not grow action endpoints as part of this task.
2. The bearer token should remain client-supplied so it is never embedded in rendered HTML.
3. Same-origin fetch keeps this page simple; cross-origin admin tooling should continue using the CLI unless CORS is added intentionally.

## Validation evidence (2026-03-19)
1. Added a new operator page at `/admin/activity` using:
   - `app/admin/activity/page.tsx`
   - `app/admin/activity/page-client.tsx`
2. Page behavior:
   - Reads the existing protected `GET /api/admin/activity` endpoint only.
   - Accepts the bearer token in the browser and stores it in `sessionStorage` for the current tab only.
   - Supports manual refresh, auto-polling, threshold overrides, summary cards, and a per-room breakdown table.
3. Static quality checks:
   - `npx eslint app/admin/activity/page.tsx app/admin/activity/page-client.tsx` ✅
   - `npm run build` ✅
   - `npx tsc --noEmit` ✅ after Next regenerated route types during the build.
4. Manual local verification:
   - Started local dev server with `PORT=3008 HROOF_ACTIVITY_MONITOR_TOKEN=monitor-ui-test npm run dev`.
   - `curl http://127.0.0.1:3008/admin/activity` ✅ returned the monitor page HTML with the new `Activity Monitor` content.
   - `curl -H 'authorization: Bearer monitor-ui-test' 'http://127.0.0.1:3008/api/admin/activity?hostPresenceMs=30000&controllerPresenceMs=45000'` ✅ returned a valid JSON snapshot used by the page.
