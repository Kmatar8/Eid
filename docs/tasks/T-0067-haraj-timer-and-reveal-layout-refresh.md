# T-0067: Haraj Timer and Reveal Layout Refresh

- Status: done
- Milestone: M4
- PRD Reference: 8.6.1, 8.6.2, M4

## Objective
Increase the Haraj estimate collection window to one minute and improve Haraj runtime readability across host and controller surfaces, including a clearer host timer panel and card-based reveal results that fit at least 20 players without vertical scroll.

## Scope
### In
1. Update the server-authoritative Haraj collection timer from 15 seconds to 60 seconds.
2. Update host/runtime copy that references the Haraj collection duration.
3. Add a clearer host timer/status block between the two team score cards during Haraj collection.
4. Make the controller Haraj timer more prominent and clearly labeled.
5. Replace the host Haraj reveal results table with per-player result cards that emphasize the submitted estimate in large numerals.
6. Keep the reveal layout dense enough for at least 20 player cards without requiring vertical page scroll on the host stage.

### Out
1. Haraj scoring-rule changes.
2. Product catalog changes.
3. Team model or game-switching behavior changes.
4. Trivia gameplay/UI changes.

## Dependencies
1. `PRD.md`
2. `lib/server/store.ts`
3. `app/host/page.tsx`
4. `app/controller/[roomId]/page-client.tsx`

## API / Contract Impact
1. No payload schema changes.
2. Existing `collectEndsAt` contract is reused with a new server-side duration.

## Data Model Impact
1. D1: no schema changes.
2. DO/runtime state model unchanged; only timer constant and presentation change.

## Implementation Plan
1. Update PRD timing and host-layout requirements for Haraj.
2. Change the authoritative Haraj collection window to 60 seconds.
3. Refresh host Haraj copy and add the centered timer block between the score cards.
4. Replace the host reveal table with compact result cards sized for dense display.
5. Promote the controller Haraj timer into a clearer, larger timer card.
6. Run scoped lint and full typecheck, then record validation evidence.

## Acceptance Criteria
1. A Haraj round stays open for 60 seconds unless all eligible players submit earlier.
2. Host Haraj collecting stage shows a dedicated timer panel between the two score cards with clear explanatory copy.
3. Controller Haraj collecting stage shows a clearly labeled, prominent countdown.
4. Host Haraj reveal no longer uses a table; each player's submitted estimate is shown inside a card with a large number.
5. Host reveal layout fits at least 20 result cards without requiring vertical page scroll in the active game stage.
6. Scoped lint and typecheck pass.

## Validation Checklist
- [x] Verify PRD updated to 60-second Haraj collection timing and card-based reveal layout.
- [x] Verify `HARAJ_COLLECT_WINDOW_MS` changed to 60 seconds.
- [x] Verify host collecting stage timer block is centered between the two team score cards.
- [x] Verify host reveal uses player cards instead of a table.
- [x] Verify controller Haraj timer is more prominent and clearly labeled.
- [x] Scoped lint pass.
- [x] Typecheck pass.
- [x] Manual layout review for 20-card density (code-level verification in absence of live room run).

## Validation Evidence
1. Updated `PRD.md` to set Haraj collection timing to `60` seconds and document the centered host timer block plus card-based reveal layout.
2. Updated `lib/server/store.ts` so `HARAJ_COLLECT_WINDOW_MS = 60 * 1000`, keeping `collectEndsAt` as the authoritative runtime contract.
3. Updated `app/host/page.tsx` to:
   - show a centered Haraj timer/status block between the two team score cards,
   - update host copy from `15` seconds to `60` seconds,
   - replace the reveal table with a dense `auto-rows-fr` result-card grid sized for no-scroll active-stage display.
4. Updated `app/controller/[roomId]/page-client.tsx` to promote Haraj countdown visibility into a dedicated timer card with explicit labeling.
5. `npx eslint lib/server/store.ts app/host/page.tsx 'app/controller/[roomId]/page-client.tsx'` passed with warnings only and no errors.
6. `npx tsc --noEmit` passed.

## Rollback Plan
1. Revert `PRD.md`.
2. Revert Haraj timer/UI changes in host/controller/store files.
3. Revert this task entry and milestone-board row if the refresh is abandoned.

## Notes / Risks
1. Dense reveal cards trade some per-card whitespace for capacity; typography must stay readable at TV distance.
2. Active game stage already uses `overflow-hidden`, so reveal-card density must be implemented with fixed-height grid behavior rather than scroll.
