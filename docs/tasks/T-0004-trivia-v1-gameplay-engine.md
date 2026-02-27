# T-0004: Trivia v1 Gameplay Engine (Primary + Steal)

- Status: done
- Milestone: M4
- PRD Reference: 6, 8, 8.1, 8.2, 8.3, 8.4, 12, 14

## Objective
Deliver Trivia v1 end-to-end gameplay engine with question lifecycle, primary/steal answer flow, fairness-driven responder selection, and immediate team score updates.

## Scope
### In
1. Trivia game session initialization and question sequencing.
2. Game phases:
- `question_prepare`
- `question_active_primary_team`
- `question_active_steal_team`
- `answer_reveal`
- `score_commit`
- `next_question_or_end`
3. Random starting team logic (balanced over session).
4. Fair responder selection per team (`timesAnswered` weighted).
5. Controller mode switching for selected player only (`multiple_choice`).
6. Primary and steal answer validation.
7. Team score mutation using agreed scoring:
- primary correct `+10`
- steal correct `+6`
8. Live host updates for question state and scores.
9. Persistent trivia session and answer events.

### Out
1. Additional game modes beyond trivia.
2. Advanced moderation tools for question editing during live game.
3. AI-generated questions.
4. Individual player ranking in v1.

## Dependencies
1. `T-0001` completed (room/join/reconnect).
2. `T-0002` completed (realtime protocol).
3. `T-0003` completed (teams + team score persistence).
4. Question source/data pipeline available (seeded DB or static bank).

## API / Contract Impact
1. Host actions:
- `host.startTrivia`
- `host.nextQuestion`
- `host.endTrivia`
2. Player action:
- `player.submitAnswer`
3. Server broadcasts:
- `room.question`
- `room.controllerMode`
- `room.answerReveal`
- `room.score`
- `room.state`

## Data Model Impact
1. New D1 tables/indexes:
- `trivia_games(game_id, room_id, started_at, ended_at, question_count, status)`
- `trivia_questions(question_id, game_id, prompt, option_a, option_b, option_c, option_d, correct_option, order_no)`
- `trivia_attempts(attempt_id, game_id, question_id, player_id, team_id, phase, selected_option, is_correct, created_at)`
- `player_answer_stats(room_id, player_id, times_answered, times_correct, updated_at)`
2. Optional event stream enrichment:
- question lifecycle and score-commit events in `room_events`.

## Implementation Plan
1. Define trivia state schema in DO room context:
- current question index
- current phase
- current team turn
- selected responder playerId
- pending steal state
2. Implement question loader and deterministic ordering.
3. Implement starting team decision strategy:
- alternate by question index or weighted balance.
4. Implement fair responder selector:
- minimum `timesAnswered` first, random tie-break.
5. Implement controller targeting:
- only selected player receives answer options
- other players receive spectator state
6. Implement answer submission handler:
- validate actor is current responder
- validate phase and timeout
- commit primary/steal transition
7. Implement score commit rules:
- apply points according to primary/steal correctness
- increment score version and broadcast immediately
8. Persist attempts and update player answer stats.
9. Implement game end logic:
- final scoreboard
- transition room to `between_games`.
10. Add tests and manual scenario validation.

## Acceptance Criteria
1. Host can start trivia only after teams are ready.
2. For each question, exactly one player is active responder at a time.
3. Wrong primary answer triggers steal flow for opposite team.
4. Score updates are immediate on host screen after commit.
5. Responder selection is fair over session (no starvation under normal question count).
6. Reconnect during active question restores correct controller state.
7. Game transitions to end state after final question with final scores persisted.
8. Invalid submissions (wrong player, wrong phase, duplicate) are rejected safely.

## Validation Checklist
- [x] Lint/typecheck pass.
- [ ] Unit tests for phase transitions and scoring rules.
- [ ] Unit tests for responder fairness selector.
- [x] Integration-style flow for primary answer + steal flow + next question progression.
- [x] Integration-style flow for invalid responder rejection.
- [x] Manual: room state reflects active question/responder and score updates.

## Validation Evidence (2026-02-22)
1. Trivia question bank added (`lib/server/trivia-bank.ts`, 24 questions).
2. Trivia actions added:
- `host.startTrivia`
- `host.nextQuestion`
- `player.submitAnswer`
3. Runtime behavior verified:
- start trivia sets `question_active_primary_team`.
- wrong responder submit -> `403 TRIVIA_INVALID_RESPONDER`.
- primary wrong path triggers `trivia.steal_ready`.
- steal answer resolves to `trivia.answer_reveal` and team score updates.
- host `nextQuestion` advances question index.

## Rollback Plan
1. Disable trivia action handlers and controller mode switch for trivia.
2. Revert trivia-specific state transitions in DO.
3. Preserve room/team baseline functionality (non-game mode).
4. Keep persisted trivia data for audit but hide from runtime until fixed.

## Risks / Notes
1. Timing edge cases around simultaneous answer submissions require strict single-writer checks.
2. Fairness guarantees depend on enough question count relative to player count.
3. Controller targeting bugs can expose answer controls to wrong players.
4. Keep question payload minimal and avoid leaking `correct_option` to clients.
