# T-0009: Jeopardy Trivia Board + TV Host Layout Refactor

- Status: in_progress
- Milestone: M4
- PRD Reference: 2, 6, 6.1, 6.2, 8, 10.2, 12, 14

## Objective
Convert the current linear trivia flow into a Jeopardy-style board game with buzzer mechanics, alternating team turns, and clear TV-first host visibility, while keeping server-authoritative scoring and progression.

## Scope
### In
1. Replace trivia runtime model with Jeopardy board (`6` categories x `5` clues).
2. Implement point ladder `10/20/30/40/50` and per-clue scoring (`+points` correct, `-points` wrong).
3. Add turn-based category picking with alternating team ownership.
4. Add buzzer gameplay:
   - All players eligible to buzz.
   - `5s` countdown before reveal.
   - `20s` buzzer window.
   - First buzz locks responder.
5. Show answer choices only to locked responder controller.
6. Keep host fallback action to select another responder from same team when needed.
7. Refactor host trivia screen layout for TV/wide screens to reduce dead space and improve readability.
8. Update host copy/rules messaging to reflect Jeopardy behavior (no steal mode).

### Out
1. New persistent schema migrations in D1 for trivia content management.
2. WebSocket transport migration (polling remains in this task).
3. Additional game engines beyond trivia.

## Dependencies
1. Existing room lifecycle and team assignment paths in `lib/server/store.ts`.
2. Existing host/controller runtime routes (`/host`, `/controller/:roomId`).
3. Existing protocol + action route validation.

## API / Contract Impact
1. Add host action `host.selectTriviaClue` with payload `{ questionId }`.
2. Keep host action `host.selectAnotherResponder` and adapt it to Jeopardy phases.
3. Reuse player action `player.input` for buzzer events.
4. Update trivia snapshot contract to include board and Jeopardy turn fields.

## Data Model Impact
1. D1: no schema change.
2. DO/in-memory: trivia session structure changes significantly (board + timers + responder lock).
3. R2: no impact.

## Implementation Plan
1. Update PRD and task docs.
2. Refactor shared types and trivia question bank for Jeopardy metadata.
3. Rebuild trivia engine in store:
   - board initialization
   - clue selection
   - timer-driven phase transitions
   - buzzer lock
   - answer scoring
   - turn switching/end conditions
4. Add protocol/action-route support for new host action and error mapping.
5. Refactor host trivia UI to TV-first wide layout and Jeopardy controls/overlays.
6. Refactor controller UI to buzzer/answer-only UX with clear team/player targeting.
7. Run lint + build and record validation evidence.

## Acceptance Criteria
1. Host can start trivia and see a 6x5 category board.
2. Team turn alternates every resolved clue, with active picker context shown.
3. Selecting a clue starts 5-second countdown then opens buzzer window.
4. First buzzer press locks responder; only that responder can answer.
5. Correct answer adds clue points; wrong answer subtracts clue points.
6. No steal flow is present.
7. Host can reselect another responder from same team during active answer when needed.
8. Host screen uses TV-appropriate spacing and typography with no large empty dead zones.
9. Controller screen shows only essential gameplay UI (buzzer/question/answers context).

## Validation Checklist
- [x] Lint/typecheck pass.
- [x] Build pass.
- [ ] Manual: host start trivia -> board shown with all clues available.
- [ ] Manual: clue select -> countdown -> buzzer -> responder lock flow.
- [ ] Manual: correct and wrong answers update team score (+/-).
- [ ] Manual: host fallback reselect responder works.
- [ ] Manual: alternating team turns continue until board completion.
- [ ] Manual: host TV layout remains readable on wide display.

## Validation Evidence
1. `npm run lint` passed with warnings only (no errors).
2. `npm run build` passed with successful production compilation.
3. `scripts/smoke-live.sh` updated to Jeopardy flow (`host.selectTriviaClue` + buzzer + answer path) for live verification.

## Rollback Plan
1. Revert trivia engine/session model changes in `lib/server/store.ts` and related types.
2. Remove `host.selectTriviaClue` from protocol/route mapping.
3. Revert `/host` and controller trivia view to prior stable flow.
4. Redeploy last stable release.

## Notes / Risks
1. Polling-based timers depend on frequent host/controller refresh; timer transitions are enforced on server reads/actions.
2. Buzzer fairness is server-first but still bounded by network latency across devices.
3. Exposing options in host snapshot can be inspected by clients; future hardening may add role-filtered payloads.
