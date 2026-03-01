# T-0030: Team Name Min Length + Lobby UX Clarity

- Status: done
- Milestone: M3
- PRD Reference: 6.1, 12.1 (`host.renameTeam`), 15 (M3)

## Objective
Adjust lobby team naming behavior so team names can be a single character and remove input placeholders from team name fields.

## Scope
### In
1. Remove team-name input placeholders on host lobby team naming fields.
2. Change team name minimum length validation from `2` to `1` character (max remains `24`) across host client and server validation.
3. Update API error text to match the new validation boundary.

### Out
1. Any schema/data model changes.
2. Drag-and-drop UI redesign implementation (recommendations only in response).

## Dependencies
1. Host lobby runtime UI in `app/host/page.tsx`.
2. Room action validation in `lib/server/store.ts`.
3. Host room action API route in `app/api/rooms/[roomId]/actions/route.ts`.

## API / Contract Impact
1. `host.renameTeam` validation contract changes from `2..24` to `1..24` characters.

## Data Model Impact (D1/DO/R2)
1. D1: no change.
2. DO/state model: no schema change; validation rule only.
3. R2: no change.

## Implementation plan
1. Update host-side validation and start-session readiness checks to accept min length `1`.
2. Remove team-name placeholders from host lobby input fields.
3. Update server-side `host.renameTeam` validation to min length `1`.
4. Update API error text to `1 and 24`.
5. Run focused lint/type validation on touched files.

## Acceptance criteria
1. Team name inputs render with no placeholder text.
2. A single-character trimmed team name is accepted by UI and by server action handler.
3. Empty/whitespace-only team name is still rejected.
4. API error message reflects `1..24` limits.

## Validation checklist
- [x] Focused lint/type checks pass for touched files.
- [x] Manual verification: single-character team name can be saved and session can start when both teams are named.
- [x] Manual verification: blank team name remains blocked.

## Validation evidence (2026-03-01)
1. Focused lint:
   - `npx eslint app/host/page.tsx lib/server/store.ts 'app/api/rooms/[roomId]/actions/route.ts'` ✅ (warnings only, no errors)
2. Build/type check:
   - `npm run build` ✅
3. Manual API flow (`PORT=4014 npm run dev`):
   - Login with CSV credential succeeded (`POST /api/auth/host/login` => `200`).
   - Room creation succeeded (`POST /api/rooms/create` => `201`).
   - Team rename with single-character name succeeded (`host.renameTeam` with `"A"` => `200`).
   - Blank team rename rejected (`host.renameTeam` with whitespace => `400 INVALID_TEAM_NAME`).

## Rollback plan
1. Restore previous min-length checks (`2`) in host and server validation paths.
2. Restore previous API error text.
3. Restore placeholders in host input fields if needed.

## Notes/risks
1. Allowing one-character names can reduce readability on large screens; this is accepted by current requirement.
