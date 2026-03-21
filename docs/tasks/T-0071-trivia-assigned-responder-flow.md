# T-0071: Trivia Assigned Responder Flow (No Buzzer)

- Status: done
- Milestone: M4
- PRD Reference: 6, 6.1, 6.2, 8.2, 8.3, 8.4, 8.5, 15 (M4)

## Objective
Replace the Jeopardy buzzer flow with a lower-contention assigned-responder flow: the randomly selected picker answers first, then one random player from the other team gets a steal chance on wrong/timeout.

## Scope
### In
1. Update PRD trivia rules to remove buzzer-based answering.
2. Refactor trivia runtime phases and timers to go from countdown directly into assigned answer mode.
3. Make the picker the primary responder for each selected clue.
4. On wrong/timeout, hand the clue to one random responder from the other team.
5. Update host/controller UI copy and controls to reflect no-buzzer gameplay.
6. Keep host fallback reselection for the currently active answering team.

### Out
1. New schema migrations.
2. Haraj gameplay changes.
3. New admin surfaces for responder history.

## Dependencies
1. `PRD.md`
2. `lib/server/types.ts`
3. `lib/server/store.ts`
4. `app/host/page.tsx`
5. `app/controller/[roomId]/page-client.tsx`

## API / Contract Impact
1. `host.selectTriviaClue` remains required.
2. `host.selectAnotherResponder` remains supported for same-team fallback.
3. `player.submitAnswer` remains the only trivia answer submission action.
4. Controller no longer depends on rapid-fire `player.input` buzz actions for trivia answering.

## Data Model Impact
1. D1: no change.
2. DO/runtime: trivia phase sequencing and responder handoff rules change.
3. R2: no change.

## Implementation Plan
1. Update PRD and task docs.
2. Refactor shared trivia types for the no-buzzer phase model.
3. Update store trivia transitions for primary responder, steal responder, and scoring.
4. Update host UI status/reveal messaging and remove buzzer-specific surfaces.
5. Update controller UI to waiting/assigned-answer states only.
6. Run lint/build and record validation evidence.

## Acceptance Criteria
1. Selecting a clue starts a countdown and then assigns the picker as the active responder.
2. Only the assigned responder can answer.
3. Wrong/timeout on the primary responder hands the clue to one random player from the other team.
4. Wrong/timeout on the steal responder ends the clue and host can advance.
5. Host and controller UIs show no buzzer CTA or buzzer countdown.
6. Lint/build pass for the changed scope.

## Validation Checklist
- [x] Countdown transitions directly to assigned answer mode.
- [x] Only assigned responder can submit.
- [x] Wrong primary answer hands off to other team.
- [x] Wrong steal answer ends clue.
- [x] No buzzer UI remains on host/controller.
- [x] Scoped lint/build pass.

## Validation Evidence
1. Updated `PRD.md` to remove buzzer-based trivia flow and define picker-first answering plus one random steal responder from the other team.
2. Updated `lib/server/store.ts` so:
   - clue selection assigns `currentPickerPlayerId` as the first responder,
   - countdown transitions directly to `answer_active`,
   - wrong/timeout on the primary responder applies score penalty and starts `trivia.steal_started`,
   - wrong/timeout on the steal responder ends the clue in `answer_reveal`.
3. Updated host/controller runtime UI to remove all buzzer-specific CTA/countdown surfaces and show assigned responder or steal copy instead.
4. Validation commands:
   - `npx eslint app/host/page.tsx 'app/controller/[roomId]/page-client.tsx' lib/server/store.ts` ✅ (warnings only, no errors)
   - `npx tsc --noEmit` ✅
   - `npm run build` ✅

## Rollback Plan
1. Restore buzzer-based trivia PRD and runtime flow.
2. Restore buzzer UI on host/controller surfaces.
3. Re-run lint/build.

## Notes / Risks
1. Score impact on wrong answers remains team-negative unless adjusted later by product decision.
2. Existing smoke/live scripts may need follow-up updates if they still simulate buzz traffic.
3. A live multi-device trivia pass is still recommended before closing the task because this changes core gameplay sequencing.
