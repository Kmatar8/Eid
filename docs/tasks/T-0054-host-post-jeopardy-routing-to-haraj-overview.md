# T-0054: Host Post-Jeopardy Routing to Haraj Overview

- Status: done
- Milestone: M4
- PRD Reference: 6.1, 15

## Objective
Fix host progression flow so completing Jeopardy routes to Haraj overview/start screen, while final results screen is shown only after all games are completed.

## Scope
### In
1. Add explicit host stage for Haraj overview after Jeopardy completion.
2. Route `between_games` state to Haraj overview when Jeopardy is complete and Haraj is idle.
3. Restrict final celebration stage to the fully-completed state (all games done).
4. Provide Haraj overview card with clear start action.

### Out
1. Room action API changes.
2. Scoring/round logic changes.
3. Controller UI changes.

## Dependencies
1. `app/host/page.tsx`
2. `PRD.md`

## API / Contracts Impacted
1. No API contract changes.
2. Host stage-selection logic only.

## Data Model Impact (D1/DO/R2)
1. D1: no change.
2. DO: no change.
3. R2: no change.

## Implementation plan
1. Update PRD progression rules for post-Jeopardy and final-results gating.
2. Add `haraj_overview` stage to host runtime stage model.
3. Route `between_games` stage based on trivia/haraj completion status.
4. Render dedicated Haraj overview panel with start action.
5. Validate with lint/typecheck/build and record evidence.

## Acceptance criteria
1. Completing Jeopardy no longer lands on final results page.
2. Host sees Haraj overview screen with start Haraj action after Jeopardy completes.
3. Final results page appears only when Jeopardy and Haraj are both completed.
4. Build/typecheck pass.

## Validation checklist
- [x] Focused lint passes for host page.
- [x] Typecheck passes.
- [x] Build passes.

## Validation evidence (2026-03-01)
1. Focused lint:
   - `npx eslint app/host/page.tsx` ✅ (warnings only, no errors)
2. Typecheck:
   - `npx tsc --noEmit` ✅
3. Build:
   - `npm run build` ✅
4. Runtime flow behavior:
   - `between_games` now routes to `haraj_overview` when `trivia=completed` and `haraj=idle`.
   - Final `celebration` stage now appears only when both games are completed.
   - Haraj overview card includes explicit `ابدأ لعبة الحراج` action.

## Rollback plan
1. Revert host stage mapping to previous `between_games -> celebration` behavior.
2. Remove Haraj overview render block.
3. Revert PRD updates for progression rules.

## Notes/risks
1. Any future additional game types should extend stage routing logic to avoid regressing final-results gating.
