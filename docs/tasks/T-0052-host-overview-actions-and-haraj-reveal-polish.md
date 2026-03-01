# T-0052: Host Overview Actions and Haraj Reveal Polish

- Status: done
- Milestone: M4
- PRD Reference: 6.1, 8.6, 15

## Objective
Polish host UX by removing end-session buttons from overview cards and improving Haraj reveal presentation/feedback with width alignment, confetti timing, and winner-row highlighting.

## Scope
### In
1. Remove `إنهاء الجلسة` button from the Jeopardy game overview card.
2. Remove end-action button from the second game overview/celebration card.
3. Make Haraj `الجولة التالية` button match the reveal image column width.
4. Trigger Haraj confetti when the price is revealed (including non-countdown reveal paths).
5. Color-highlight only scoring players in Haraj reveal table using rank-based colors.

### Out
1. Global floating end-session icon behavior.
2. API/state contract changes.
3. Scoring or tie algorithm changes.

## Dependencies
1. `app/host/page.tsx`
2. `PRD.md`

## API / Contracts Impacted
1. No API/event contract changes.

## Data Model Impact (D1/DO/R2)
1. D1: no change.
2. DO: no change.
3. R2: no change.

## Implementation plan
1. Update PRD UX language for overview/end-button policy and Haraj reveal visuals.
2. Patch host overview and celebration card actions to remove end buttons.
3. Refactor Haraj reveal layout so next-round CTA uses the same column width as reveal image.
4. Extend Haraj reveal confetti trigger logic to fire when reveal becomes visible.
5. Add rank-aware row highlight styles for points-awarded rows only.
6. Run focused lint/typecheck/build and record evidence.

## Acceptance criteria
1. Jeopardy overview card no longer shows `إنهاء الجلسة`.
2. Second game overview/celebration card no longer shows end-action button.
3. Haraj `الجولة التالية` button visually matches image column width.
4. Haraj reveal fires confetti when price is revealed.
5. Only rows with `pointsAwarded > 0` receive winner highlight colors in reveal table.

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
4. Runtime/UI updates implemented:
   - Removed in-card end-session button from overview card.
   - Removed in-card end button from celebration/second overview card.
   - Haraj `الجولة التالية` CTA moved under reveal image and set to full image-column width.
   - Haraj reveal confetti now fires when reveal appears (immediate or post-countdown) once per round.
   - Haraj reveal table highlights only scoring rows with rank-based color tones.

## Rollback plan
1. Revert overview/celebration CTA changes in host page.
2. Revert Haraj reveal confetti and row-style logic.
3. Revert PRD updates.

## Notes/risks
1. Confetti should run once per reveal round to avoid repeated burst on stream updates.
