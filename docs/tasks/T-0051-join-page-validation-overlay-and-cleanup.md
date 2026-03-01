# T-0051: Join Page Validation Overlay and UI Cleanup

- Status: done
- Milestone: M4
- PRD Reference: 6.5, 15

## Objective
Update the player join page to enforce name/avatar selection with explicit overlay guidance and remove host/debug-oriented blocks from player-facing UI.

## Scope
### In
1. Remove the hardcoded name example placeholder (`خالد السريع`) from join input.
2. Add overlay popup guidance when submit is attempted without name and/or avatar selection.
3. Remove the room-id display block from join header.
4. Remove the `لوحة تحكم المضيف` block from join page footer.

### Out
1. API contract changes for room join.
2. Controller gameplay screen changes.
3. Host lobby/host runtime UI changes.

## Dependencies
1. `app/join/[roomId]/page-client.tsx`
2. `PRD.md`

## API / Contracts Impacted
1. No API payload shape changes.
2. Client-side validation flow updated before `joinRoom` call.

## Data Model Impact (D1/DO/R2)
1. D1: no changes.
2. DO: no changes.
3. R2: no changes.

## Implementation plan
1. Add PRD requirement entry for join validation and player-facing content policy.
2. Implement client-side validation overlay state and submit guards.
3. Update join form defaults so avatar must be explicitly selected.
4. Remove room-id and host-control visual blocks from join screen.
5. Run focused lint/typecheck/build and record evidence.

## Acceptance criteria
1. Name field no longer uses `خالد السريع` placeholder.
2. Submit attempt without name and/or avatar shows modal-style guidance overlay.
3. Join page no longer shows room-id block.
4. Join page no longer shows `لوحة تحكم المضيف`.
5. Build/typecheck passes.

## Validation checklist
- [x] Focused lint passes for changed files.
- [x] Typecheck passes.
- [x] Build passes.

## Validation evidence (2026-03-01)
1. Focused lint:
   - `npx eslint 'app/join/[roomId]/page-client.tsx'` ✅ (warnings only, no errors)
2. Typecheck:
   - `npx tsc --noEmit` ✅
3. Build:
   - `npm run build` ✅
4. Runtime behavior implemented:
   - Removed name placeholder example `خالد السريع`.
   - Added modal-style validation overlay when submit is attempted without name/avatar selection.
   - Removed room-id block from join header.
   - Removed `لوحة تحكم المضيف` block from join footer.

## Rollback plan
1. Revert join page client to previous validation and footer/header blocks.
2. Revert PRD section updates.

## Notes/risks
1. Existing sessions still bypass join flow through `متابعة الجلسة الحالية` action by design.
