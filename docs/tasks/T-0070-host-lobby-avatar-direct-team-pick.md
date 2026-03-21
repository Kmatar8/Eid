# T-0070: Host Lobby Avatar Direct Team Pick

- Status: done
- Milestone: M3
- PRD Reference: 6.1, 12.1, 15 (M3)

## Objective
Make host lobby team assignment easier on touch and TV-control setups by allowing the player avatar itself to open the team picker, not just the small `+` icon.

## Scope
### In
1. Make each unassigned player avatar open the team picker when the host taps/clicks it.
2. Keep the existing `+` affordance visible for clarity.
3. Preserve current assigned-player behavior (no picker affordance once assigned).

### Out
1. Changes to team assignment server actions.
2. Changes to join/controller pages.
3. Changes to team readiness rules.

## Dependencies
1. `app/host/page.tsx`
2. Existing lobby team picker modal flow.

## API / Contract Impact
1. No API contract changes.

## Data Model Impact
1. D1: no change.
2. DO/runtime: no change.
3. R2: no change.

## Implementation Plan
1. Update task tracking for the host lobby hit-area fix.
2. Expand the click target from the `+` badge to the whole avatar card for unassigned players.
3. Keep assigned-player visuals unchanged.
4. Run scoped lint/typecheck and record evidence.

## Acceptance Criteria
1. Clicking or tapping an unassigned avatar opens the team picker.
2. The `+` icon still works and remains visible above the avatar.
3. Assigned players do not expose the picker affordance.
4. Scoped lint/typecheck pass.

## Validation Checklist
- [x] Unassigned avatar opens picker when clicking avatar body.
- [x] `+` icon still opens picker.
- [x] Assigned avatars do not open picker.
- [x] Scoped lint/typecheck pass.

## Validation Evidence
1. Updated `app/host/page.tsx` so each unassigned lobby avatar wrapper now acts as a keyboard/click target for the team picker while preserving the existing `+` badge affordance.
2. Assigned-player avatars remain non-interactive because the new wrapper click/keyboard handlers are gated behind `showPickerButton`.
3. Validation commands:
   - `npx eslint app/host/page.tsx 'app/controller/[roomId]/page-client.tsx' lib/server/store.ts` ✅ (warnings only, no errors)
   - `npx tsc --noEmit` ✅
   - `npm run build` ✅

## Rollback Plan
1. Restore avatar hit-area behavior to `+`-only.
2. Re-run scoped lint/typecheck.

## Notes / Risks
1. Avatar click behavior must not interfere with tooltip layering or focus styles.
2. Live touch-device confirmation is still recommended before closing the task.
