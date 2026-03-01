# T-0056: Host Lobby Avatar Hover and Team Picker Label Fix

- Status: done
- Milestone: M3
- PRD Reference: 6.1.3

## Objective
Improve host lobby assignment UX by removing disruptive avatar hover motion and ensuring team picker labels reflect the latest host-entered team names.

## Scope
### In
1. Disable avatar hover movement in host lobby player strip.
2. Use current team-name drafts as picker labels when host opens the player team picker.

### Out
1. Team assignment backend/API behavior.
2. Player/controller UI changes.
3. Lobby layout redesign.

## Dependencies
1. `app/host/page.tsx`

## Implementation plan (step-by-step)
1. Update host lobby avatar group usage to disable hover translate effect.
2. Update picker team label rendering to prioritize current draft names.
3. Validate with lint/build for affected scope.

## Acceptance criteria
1. Hovering player avatars in host lobby does not move avatars up/down.
2. Team picker modal shows host-typed team names immediately (even before session start).
3. Default fallback labels still appear when no custom name is set.

## Validation checklist
- [x] Avatar hover movement disabled.
- [x] Team picker labels use draft names.
- [x] `npm run lint -- app/host/page.tsx` passes.
- [x] `npm run build` passes.

## Validation Evidence (2026-03-01)
1. Avatar hover translate disabled on host lobby strip by setting `translate={0}` on `AvatarGroup`.
2. Team picker now resolves each team display label from current host draft name first, then server name fallback.
3. Validation commands:
   - `npm run lint -- app/host/page.tsx` ✅ (warnings only, no errors)
   - `npm run build` ✅

## Rollback plan
1. Revert `app/host/page.tsx` changes for avatar group and picker label rendering.

## Notes/risks
1. Draft labels are local UI state until host starts session and names are persisted.
