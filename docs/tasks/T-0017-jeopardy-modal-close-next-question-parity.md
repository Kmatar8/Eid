# T-0017: Jeopardy Modal Close/Next Transition Parity

- Status: done
- Milestone: M4 Trivia v1
- PRD Reference: 6.1, 8.3, 12.1

## Objective
Ensure the question modal close button (`X`) behaves exactly like the modal primary CTA (`Next Question/Skip`) so host always transitions correctly back to board flow and feedback overlays do not remain stuck.

## Scope (in/out)
### In
1. Unify host question-modal close and next CTA to a single transition handler.
2. Make close action trigger `host.nextQuestion` behavior when game phase allows it.
3. Clear visual feedback overlay state when host exits question modal flow.

### Out
1. Trivia scoring or timer rule changes.
2. Controller-side UI changes.
3. Protocol or schema changes.

## Dependencies
1. `app/host/page.tsx` modal and stage rendering.
2. Existing `host.nextQuestion` action behavior in room state machine.

## API/events/contracts impacted
1. No API contract changes.
2. Reuses existing `host.nextQuestion` command path.

## Data model impact (D1/DO/R2)
1. D1: none.
2. Runtime state: none (behavioral UI/command wiring only).
3. R2: none.

## Implementation plan (step-by-step)
1. Add a modal transition guard (`canAdvanceFromQuestionModal`) in host view logic.
2. Add one modal-exit handler to drive both `X` and primary CTA behavior.
3. Ensure handler clears feedback overlay state and advances turn when applicable.
4. Validate with lint/build.

## Acceptance criteria
1. Clicking `X` in question modal advances exactly like `Next Question/Skip`.
2. Host returns to board selection flow after close in actionable phases.
3. Right/wrong feedback icon no longer stays stuck when closing via `X`.
4. Lint/build pass.

## Validation checklist
- [x] Lint pass.
- [x] Build pass.
- [ ] Manual: `X` in `answer_reveal` behaves same as "العودة للوحة (السؤال التالي)".
- [ ] Manual: feedback overlay does not remain visible after host modal close transition.

## Validation evidence
1. `app/host/page.tsx`: modal close `X` and primary CTA now both call `handleQuestionModalExit`, which reuses `host.nextQuestion` transition path when phase permits.
2. `app/host/page.tsx`: feedback overlay state is cleared on modal exit handler start (`setFeedbackState(null)`), preventing stuck right/wrong icon when closing via `X`.
3. `npm run lint` passed with warnings only.
4. `npm run build` passed.

## Rollback plan
1. Revert host modal handler unification in `app/host/page.tsx`.
2. Restore separate `X` close-only behavior and previous button wiring.

## Notes/risks
1. If `host.nextQuestion` fails transiently, modal stays visible and error appears, which preserves operator awareness.
