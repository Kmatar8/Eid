# T-0011: Join-to-Game UI Polish (Join, Controller, Host, Room)

- Status: done
- Milestone: M4
- PRD Reference: 6.1, 6.2, 8.2, 8.3

## Objective
Improve visual quality and consistency for the player/host runtime journey starting at join and continuing through controller/game screens, with stronger color hierarchy, readability, and game-state clarity.

## Scope
### In
1. Enhance `app/join/[roomId]/page-client.tsx` visual hierarchy, color system usage, and call-to-action clarity.
2. Enhance `app/controller/[roomId]/page-client.tsx` game-state surfaces, buzzer emphasis, answer option readability, and feedback messaging presentation.
3. Enhance `app/host/page.tsx` lobby/overview/trivia/paused/celebration section styling for improved TV readability and consistency.
4. Enhance `app/room/[roomId]/page-client.tsx` and `components/live/room-state-panel.tsx` to match the updated visual language.
5. Add/adjust global utility styles and tokens in `app/globals.css` only as needed for consistency.

### Out
1. Any gameplay logic changes or state-machine changes.
2. API/protocol/event contract changes.
3. New routes or auth/session flow changes.

## Dependencies
1. Existing host/controller/join page structure and state wiring.
2. Existing design primitives (`Button`, theme tokens, glass style variables).

## API / Contract Impact
1. No API changes.
2. No websocket/action contract changes.

## Data Model Impact
1. D1: no changes.
2. Durable Object/runtime data: no changes.
3. R2: no changes.

## Implementation Plan
1. Define/extend reusable visual utilities in `app/globals.css`.
2. Apply enhanced structure and styles on join page.
3. Apply enhanced structure and styles on controller page.
4. Apply enhanced structure and styles across host stages.
5. Update room diagnostic page + panel styling for consistency.
6. Run lint/build and resolve any regressions.
7. Capture validation evidence and mark task complete.

## Acceptance Criteria
1. Join page has clear visual hierarchy with high-contrast CTA and better onboarding feel.
2. Controller page clearly communicates phase/ownership (buzzer vs answer) with improved color clarity and action affordances.
3. Host page sections are visually consistent, high-legibility on TV, and maintain team color cues.
4. Room diagnostics page matches the updated style language and remains readable.
5. No gameplay behavior regressions are introduced.
6. `npm run lint` and `npm run build` pass.

## Validation Checklist
- [x] Visual review: join page hierarchy and CTA readability.
- [x] Visual review: controller buzzer/answer states readable and distinct.
- [x] Visual review: host stage pages consistent and TV-readable.
- [x] Visual review: room diagnostics styling consistent.
- [x] Lint pass.
- [x] Build pass.

## Validation Evidence
1. `npm run lint` completed with warnings only (no errors).
2. `npm run build` completed successfully.
3. Manual visual pass completed for:
   - `/join/[roomId]`
   - `/controller/[roomId]`
   - `/host` (lobby/overview/trivia/paused/celebration)
   - `/room/[roomId]`

## Rollback Plan
1. Revert UI-only changes in affected files.
2. Keep existing logic/state-machine code unchanged.
3. Redeploy prior commit if visual regressions appear in production.

## Notes / Risks
1. Large className edits can introduce accidental layout regressions on narrow devices.
2. TV readability depends on contrast and scale; verify key text sizes in host game stage.
