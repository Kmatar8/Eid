# T-0032: Lobby Team Assignment Guidance + Start Validation Popup

- Status: in_progress
- Milestone: M3
- PRD Reference: 6.1, 12.1 (`host.assignPlayerTeam`, `host.renameTeam`, `host.startTeams`), 15 (M3)

## Objective
Improve host lobby team setup UX by:
1. Replacing drag-and-drop assignment with explicit avatar `+` assignment actions.
2. Showing a corrective popup for 10 seconds when host clicks start without valid team setup.

## Scope
### In
1. Disable drag-and-drop interactions in host lobby team setup.
2. Add animated `+` action on every avatar to open team chooser with guidance text.
3. Team chooser displays two options using team colors and names (fallback to color labels when names are still default/empty).
4. On start attempt with invalid setup (missing team names or unassigned players), show corrective popup for 10 seconds and block progression.
5. Require all players assigned to teams before start progression.
6. Ensure team name input fields do not render seeded default values (`Team A`/`Team B`) and appear empty until host enters custom names.

### Out
1. Changes to server-side team balancing algorithm.
2. Changes to join/controller pages.
3. Schema or migration changes.

## Dependencies
1. Host lobby runtime in `app/host/page.tsx`.
2. Existing room action contracts in `app/api/rooms/[roomId]/actions/route.ts`.

## API / Contract Impact
1. No API contract shape change.
2. Client-side gating for start flow adds stricter readiness (all players assigned + team names present).

## Data Model Impact (D1/DO/R2)
1. D1: no change.
2. DO: no change.
3. R2: no change.

## Implementation plan
1. Add local lobby validation helper for start prerequisites.
2. Add 10-second popup state + auto-dismiss.
3. Replace drag/drop avatar/team interactions with `+` action and chooser modal.
4. Update lobby guidance text to reflect click-based assignment.
5. Update team draft initialization to clear default seeded team names in input fields.
6. Validate with lint/build and manual API/UI checks.

## Acceptance criteria
1. Start attempt with missing team names shows popup for ~10 seconds with corrective steps.
2. Start attempt with unassigned players shows popup for ~10 seconds with corrective steps.
3. Host cannot proceed to `teams_ready` until requirements are met.
4. No drag-and-drop behavior remains in lobby avatar/team assignment.
5. Each avatar shows an animated `+`; clicking it opens team chooser with guidance text and two team options.
6. Team name input fields render empty when team names are still default `Team A`/`Team B`.

## Validation checklist
- [x] Focused lint/type checks pass for touched files.
- [x] Build passes.
- [ ] Manual lobby flow verifies corrective popup timing and assignment UX.

## Validation evidence (2026-03-01)
1. Focused lint:
   - `npx eslint app/host/page.tsx` ✅ (warnings only, no errors)
2. Build/type check:
   - `npm run build` ✅
3. Manual UI:
   - Pending host-side click-through confirmation for popup timing and chooser interaction in browser.
4. Team name input default-fill fix:
   - Updated team draft initialization in `app/host/page.tsx` to treat seeded defaults (`Team A`/`Team B`) as empty values for input rendering.
   - Result: team name inputs render blank until host enters custom names, while preserving already customized names.

## Rollback plan
1. Restore drag/drop handlers and drag states in host lobby.
2. Remove avatar `+` assignment chooser.
3. Restore previous start-button gating behavior.

## Notes/risks
1. Click-based assignment is clearer but adds one extra click versus direct drag/drop.
2. Modal chooser should remain quick to avoid slowing high-player-count lobbies.
