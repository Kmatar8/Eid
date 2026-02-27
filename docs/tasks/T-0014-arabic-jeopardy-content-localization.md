# T-0014: Arabic Localization for Jeopardy Categories + Questions

- Status: done
- Milestone: M4
- PRD Reference: 8.1, 8.2

## Objective
Localize the Jeopardy trivia content to Arabic by replacing category names, question prompts, and answer options with Arabic content while preserving gameplay structure.

## Scope
### In
1. Update `TRIVIA_CATEGORY_ORDER` names to Arabic.
2. Update all `TRIVIA_QUESTION_BANK` clues to Arabic prompts/options.
3. Keep current question IDs, category IDs, and point ladder (`10/20/30/40/50`) unchanged.

### Out
1. Gameplay logic changes.
2. Score/timer/turn changes.
3. API/protocol changes.

## Dependencies
1. `lib/server/trivia-bank.ts`
2. Existing Jeopardy board flow in `store.ts`

## API / Contract Impact
1. No contract changes.
2. Content-only localization changes.

## Data Model Impact
1. D1: no schema changes.
2. Runtime model unchanged; only static content changes.

## Implementation Plan
1. Replace category display names with Arabic labels.
2. Replace all 30 prompts/options with Arabic text.
3. Keep correctOption values and points structure valid.
4. Run lint/build.

## Acceptance Criteria
1. Board categories render in Arabic.
2. All clue prompts/options render in Arabic.
3. Each category still has exactly 5 clues.
4. Lint/build pass.

## Validation Checklist
- [x] Verify `TRIVIA_CATEGORY_ORDER` Arabic labels.
- [x] Verify `TRIVIA_QUESTION_BANK` Arabic prompts/options for all 30 clues.
- [x] Lint pass.
- [x] Build pass.

## Validation Evidence
1. `lib/server/trivia-bank.ts` updated with Arabic category names and Arabic prompts/options for all 30 clues.
2. `npm run lint` passed with warnings only (no errors).
3. `npm run build` passed.

## Rollback Plan
1. Revert `lib/server/trivia-bank.ts` to previous revision.
2. Redeploy previous commit.

## Notes / Risks
1. Ensure phrasing is clear and unambiguous for live gameplay speed.
2. Ensure correct options remain accurate after translation.
