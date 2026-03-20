# T-0068: Host Lobby Avatar Picker Layering and Team List Avatars

- Status: done
- Milestone: M3
- PRD Reference: 6.2, M3

## Objective
Fix host lobby team-assignment UX so the avatar picker `+` button stays visibly above player avatars, disappears after a player is assigned to a team, and team member rows include each player's avatar next to the name.

## Scope
### In
1. Ensure the lobby avatar picker `+` icon renders above the avatar visual stack.
2. Hide the `+` picker affordance once a player already has a team assignment.
3. Add the player avatar beside the player name in each team member list row.

### Out
1. Team assignment logic changes.
2. Modal behavior changes.
3. Join/controller UI changes.

## Dependencies
1. `app/host/page.tsx`

## API / Contract Impact
1. No contract changes.

## Data Model Impact
1. D1: no schema changes.
2. Runtime model unchanged; host-only presentation fix.

## Implementation Plan
1. Add task tracking for the lobby UX fix.
2. Adjust avatar picker button layering and conditional visibility in host lobby.
3. Render player avatars inside team member list rows.
4. Run scoped lint and typecheck.
5. Record validation evidence and mark task done.

## Acceptance Criteria
1. The host lobby `+` picker icon is visually above the avatar and remains clickable.
2. Assigned players no longer show the `+` picker icon.
3. Team member list rows show the player avatar next to the name.
4. Scoped lint and typecheck pass.

## Validation Checklist
- [x] Verify unassigned avatars show a visible top-layer `+` picker button.
- [x] Verify assigned avatars hide the `+` picker button.
- [x] Verify team member rows render avatar + name together.
- [x] Scoped lint pass.
- [x] Typecheck pass.

## Validation Evidence
1. Updated `app/host/page.tsx` so unassigned player avatars render the picker button with explicit `z-30`, while assigned players no longer render the `+` button at all.
2. Updated the team member list rows in `app/host/page.tsx` to show a small avatar component beside each player name.
3. `npx eslint app/host/page.tsx` passed with warnings only and no errors.
4. `npx tsc --noEmit` passed.

## Rollback Plan
1. Revert `app/host/page.tsx`.
2. Revert this task file and milestone-board row.

## Notes / Risks
1. `AvatarGroup` stacking behavior can obscure absolutely positioned children; explicit z-index layering is required.
