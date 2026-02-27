# T-0019: Controller Sync Reliability + UI Trim

- Status: done
- Milestone: M5
- PRD Reference: 6, 9, 14

## Objective
Improve controller real-time reliability during countdown/buzzer phases and remove unnecessary controller logout UI action.

## Scope
### In
1. Add request timeout protection for live API polling requests to prevent stuck in-flight fetches.
2. Keep controller adaptive polling active as reliability fallback even when SSE stream is connected.
3. Remove controller `خروج` button from UI.

### Out
1. Trivia rules/timers/scoring changes.
2. Host UI changes.
3. Protocol schema changes.

## Dependencies
1. `lib/client/live-api.ts`
2. `app/controller/[roomId]/page-client.tsx`

## API / Events / Contracts Impacted
1. `GET /api/rooms/[roomId]/state` client request timeout behavior (client-side only).
2. `GET /api/rooms/[roomId]/stream` remains primary push channel; polling now stays active as fallback.
3. No protocol/event schema changes.

## Data Model Impact
1. No D1 schema changes.
2. No Durable Object state shape changes.
3. No R2/KV migrations.

## Implementation Plan
1. Add timeout wrapper for `requestJson` fetch calls and retry behavior for GETs.
2. Update controller poll loop to run when visible regardless of stream connection state.
3. Remove `خروج` action from controller page.
4. Validate with lint/build.

## Acceptance Criteria
1. Controllers no longer get stuck waiting for manual refresh due to hung polling requests.
2. Controller receives countdown/buzzer updates reliably with SSE + polling safety net.
3. Controller page no longer displays `خروج` button.
4. Lint/build pass.

## Validation Checklist
- [x] Lint pass.
- [x] Build pass.
- [ ] Manual: 2+ controllers stay in sync through countdown/buzzer without tapping refresh.
- [x] Manual: controller UI has no logout button.

### Validation Evidence
1. `npm run lint` passed (warnings only, no errors).
2. `npm run build` passed successfully.
3. Controller page no longer renders `خروج`; only manual `تحديث` remains.

## Rollback Plan
1. Revert `live-api` timeout wrapper.
2. Revert controller polling fallback condition.
3. Restore removed controller logout button.

## Notes / Risks
1. Always-on polling increases request volume; adaptive intervals are retained to keep load bounded.
