# T-0066: Jeopardy Category Refresh for Tech Slot

- Status: done
- Milestone: M4
- PRD Reference: 8.1, 8.2

## Objective
Replace the Jeopardy category labeled `تقنية` with a new category and a new set of five clue prompts/options, while preserving the 6x5 board structure and existing runtime contracts.

## Scope
### In
1. Replace the user-facing `تقنية` category label with a new label.
2. Replace the five user-facing clue prompts/options currently shown under that category.
3. Keep the point ladder and five-clue structure unchanged.
4. Keep existing internal category/question IDs stable to avoid unnecessary runtime churn.

### Out
1. Gameplay logic changes.
2. Score, buzzer, timer, or turn-order changes.
3. API/protocol/storage schema changes.

## Dependencies
1. `lib/server/trivia-bank.ts`
2. Trivia board assembly in `lib/server/store.ts`

## API / Contract Impact
1. No API or event contract changes.
2. Content-only update to static trivia bank strings.

## Data Model Impact
1. D1: no schema changes.
2. DO/runtime model unchanged; only static category/question content changes.

## Implementation Plan
1. Add the task entry and mark it `in_progress`.
2. Replace the `تقنية` display label with a new category label in the trivia bank.
3. Replace the five clue prompts/options for that slot while keeping points and correct answers valid.
4. Run lint and typecheck validation for the affected scope.
5. Record validation evidence and mark the task `done`.

## Acceptance Criteria
1. The Jeopardy board no longer shows `تقنية` as a category.
2. The replacement category has exactly five clues mapped to the existing point ladder (`10/20/30/40/50`).
3. Trivia bank structure still supports a 6-category, 30-clue board with no runtime contract changes.
4. Lint and typecheck pass.

## Validation Checklist
- [x] Verify replacement category label in `TRIVIA_CATEGORY_ORDER`.
- [x] Verify five replacement clues/options under the former tech slot.
- [x] Lint pass.
- [x] Typecheck pass.
- [x] Manual content review for clarity/correctness.

## Validation Evidence
1. Updated `lib/server/trivia-bank.ts` so the former `تقنية` slot now renders as `دين` with five Islamic multiple-choice clues while preserving the existing internal `cat_tech` / `tech_*` identifiers.
2. `npx eslint lib/server/trivia-bank.ts` passed.
3. `npx tsc --noEmit` passed.
4. `npm run lint` was also sampled during execution and still fails due to pre-existing unrelated repo issues in `components/animate-ui/primitives/animate/slot.tsx` and `components/animate-ui/primitives/animate/tooltip.tsx`; no new lint issues were introduced in the changed file.

## Rollback Plan
1. Revert `lib/server/trivia-bank.ts`.
2. Revert this task file and milestone-board entry if the refresh should be discarded.

## Notes / Risks
1. Internal IDs remain `cat_tech` / `tech_*` intentionally; the change is user-facing content only.
2. Islamic-content questions should stay basic, non-controversial, and fast to answer in live play.
