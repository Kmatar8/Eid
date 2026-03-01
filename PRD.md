# PRD: Hroof Realtime Party Game Platform

## 1. Document Control
- Version: `v0.1`
- Status: `Draft for implementation planning`
- Date: `2026-02-21`
- Product: `Hroof`

## 2. Product Summary
Hroof is a TV-first multiplayer party game platform where a host mirrors their phone to a TV and runs games in real time. Players join by scanning a QR code and use their phones as controllers.

Primary launch games are Jeopardy-style Trivia (4 multiple choices) and Haraj price-estimation rounds, both with team-based scoring.

## 3. Goals
1. Deliver reliable real-time gameplay for live gatherings.
2. Allow frictionless joining via QR code.
3. Keep host display authoritative with live scoreboard updates.
4. Support persistent session data from lobby start to session end.
5. Support peak concurrency of `1,000-5,000` rooms.

## 4. Non-Goals (v1)
1. Public host self-signup without invitation/redeem controls.
2. Complex admin panel UI.
3. Individual scoring leaderboard (team score only in v1).
4. Rich media chat/social feed.

## 5. Users and Access
### 5.1 Host
- Receives a pre-issued credential `code` only (no pre-shared password distribution).
- Authenticates using the credential `code` directly on `/host/login` (no password setup).
- First successful code login activates access.
- Host account access is revoked `60 days` after first successful code login.
- Constraint: one host can run only one active room at a time.
- Constraint: one host can have only one active authenticated device session at a time; new login invalidates prior host tokens.
- Controls room lifecycle and game progression.

### 5.2 Player
- Joins via QR code URL.
- Enters name + optional avatar image or emoji.
- Uses mobile as controller.
- Can reconnect while room is active.

## 6. Core Use Case Flow
1. Host logs in and creates room.
2. Host displays large QR code on TV mirror.
3. Players scan QR and join room.
4. Host locks lobby and starts team assignment.
5. Host starts first game.
6. During gameplay, controllers switch between buzzer and answer modes and actions are sent in real time.
7. Host screen always shows live team scores.
8. Host advances through games and ends session.

### 6.1 Host Journey UX (TV-Mirrored Flow)
1. Landing primary CTA (`ابدأ الفعالية`) routes to a dedicated host login page.
2. Host login page uses festive visual style and captures only:
   - credential code
3. After login, host enters a TV-first lobby view that includes:
   - Large join QR code and join URL.
   - Live list of joined players.
   - Two team columns with host-controlled assignment interactions.
   - Editable team names before game start.
4. Host starts the session from lobby and then sees:
   - Games overview and general rules.
   - CTA to start first game.
5. Before Trivia starts, host sees a rules modal; questions are pushed to controllers only after host confirms/close.
6. During Trivia, host always sees:
   - Horizontal team scoreboard.
   - Turn context (which team picks category/points next).
   - Active responder context (player + team) after buzzer lock.
   - Manual fallback control to randomly select another responder from the same team.
7. When Trivia ends, host sees a celebration/winner screen with scores and a CTA to move to the next game.
8. During Haraj rounds, host sees product image, submission progress, reveal ranking, and team score updates.
9. Host has a persistent bottom-corner game-switch button that opens left-side game pills and can switch active game runtime.
10. If host switches away from a non-completed game, that game's progress is preserved and resumed when switching back.
11. Completed games are shown with a checkmark in the switch pills and are locked from re-entry.

### 6.2 Controller Clarity Requirements (Trivia)
1. Controller view must clearly indicate whether the current question is for the current player or another player.
2. Controller must use team color cues consistent with host screen for active team context.
3. For active responder, controller shows explicit prompt like: `"X player, this question is for you."`
4. For non-active players, controller shows who should answer and from which team.
5. During buzzer phase, all players see a buzzer control and no answer choices until responder lock.

### 6.3 Theme Policy
1. Runtime UI is dark-mode only in v1.
2. Light-mode switching is disabled across host, join, and controller surfaces.

### 6.4 Landing Page Support Chatbot
1. Landing page includes an Arabic-only customer support chatbot widget.
2. Chatbot answers only from repository-managed Markdown knowledge base content.
3. If answer is not found in knowledge base, chatbot must direct customer to WhatsApp support contact.
4. Chatbot uses external AI API (`Gemini 2.5 Flash`) through server-side integration only.
5. API keys must never be exposed to the client.
6. Chat memory context is limited to the latest `20` customer messages per session.
7. Chat messages are not persisted in D1/DO/R2.

## 7. Room Lifecycle
## 7.1 Room states
1. `lobby_open`
2. `lobby_locked`
3. `teams_ready`
4. `game_live`
5. `between_games`
6. `paused_wait_host`
7. `session_completed`
8. `expired`
9. `superseded`

## 7.2 Activity/Inactivity policy
A room is considered active in: `lobby_open`, `lobby_locked`, `teams_ready`, `game_live`, `between_games`, `paused_wait_host`.

Room becomes inactive when:
1. Host ends session manually -> `session_completed`.
2. Host creates a new room -> old room `superseded`.
3. Host disconnect grace expires -> `expired`.
4. Hard lifetime cap reached -> `expired`.

## 7.3 Timeouts (recommended)
1. `lobby_open` idle timeout: `45 minutes`.
2. Host inactivity detection threshold (active non-lobby states): `10 minutes`.
3. `paused_wait_host` grace: `20 minutes`.
   - Triggered after host inactivity detection while room is in active non-lobby game/setup states.
   - Host can resume session before grace expiry.
4. Hard cap: `4 hours` from room creation.

## 8. Trivia v1 Functional Spec (Jeopardy Style)
## 8.1 Board structure
1. Board contains `6` categories.
2. Each category contains `5` clues.
3. Point values per category row are `10`, `20`, `30`, `40`, `50`.
4. Total clues per game: `30`.

## 8.2 Turn structure
Per turn:
1. Team turns alternate strictly (`Team A`, then `Team B`, then repeat).
2. A random player from the active turn team is shown as picker for that turn.
3. Host selects one available category/point clue.
4. All controllers switch to buzzer mode.
5. A `5` second countdown runs before question reveal.
6. A `20` second buzzer window runs after reveal.
7. First player to buzz becomes the locked responder.
8. Only locked responder sees answer choices on their controller.
9. Correct answer gives responder team `+clue points`.
10. Wrong answer subtracts `-clue points` from responder team.
11. No steal mechanic in this mode.
12. Host can select another responder from the same team if locked responder is absent/inactive.
13. Host advances to the next team turn until board completion.

## 8.3 Trivia game phases
1. `board_turn`
2. `countdown`
3. `buzzer_open`
4. `answer_active`
5. `answer_reveal`
6. `next_question_or_end`

## 8.4 Scoring (team only)
- Correct answer: `+points`
- Wrong answer: `-points`
- No buzz in buzzer window: `0`

## 8.5 Fairness
- Team turn ownership alternates by rule, independent of scoring outcome.
- Picker selection inside a team is randomized with usage balancing.
- Buzzer eligibility is open to all players.

## 8.6 Haraj v1 Functional Spec (Price Estimation)
## 8.6.1 Round structure
Per round:
1. Host starts a Haraj round with a selected product image and known actual price.
2. Product image is visible to all participants.
3. Controllers accept one numeric estimate per player.
4. Collection timer is fixed at `15` seconds.
5. Estimates are hidden from all participants until lock/reveal.
6. Submission status is visible (who submitted vs who did not submit).
7. Round locks when timer expires or all players submit.
8. If no player submits by timeout, round auto-skips with zero points for all teams.
9. On reveal, host sees actual price and all player estimates with absolute difference from actual price.
10. Closest estimates receive points (`50` for rank 1, `30` for rank 2, `10` for rank 3), credited to player teams.

## 8.6.2 Haraj round phases
1. `haraj_intro`
2. `haraj_collecting`
3. `haraj_locked`
4. `haraj_reveal`
5. `haraj_scoreboard`
6. `haraj_next_round_or_end`

## 8.6.3 Haraj scoring and tie rules
1. Ranking metric is absolute difference: `abs(estimate - actualPrice)`.
2. Higher/lower estimate direction does not matter; equal absolute difference is a tie.
3. Ties share the total points of occupied ranks equally.
4. Example: two-way tie for first shares `(50 + 30) / 2 = 40` each.
5. Example: two-way tie for second shares `(30 + 10) / 2 = 20` each.
6. Players outside top 3 point slots receive `0`.

## 8.7 Multi-Game Switching Policy
1. Room runtime has a server-authoritative `activeGame` pointer (`trivia` or `haraj`) during `game_live`.
2. Host can switch active game using host action while session is active, and controllers follow server-selected game.
3. Switching does not reset team scores or game-specific progress.
4. If target game is `idle`, switching can initialize/start that game; if `in_progress`, switching resumes last progress.
5. Completed games are non-switchable and rendered as locked with checkmark in host switch UI.
6. To avoid fairness issues, switching is blocked during active timed answer/collect windows.

## 9. Reconnect Behavior
1. Player gets signed `playerSessionToken` after successful join.
2. On reopen, client attempts reconnect automatically.
3. If room still active and token valid -> player rejoins same room/team slot.
4. If room inactive/expired/superseded -> show ended state and require new join.

## 10. Cloudflare Architecture
## 10.1 Stack
1. Cloudflare Pages + Workers (single web app with multiple routes).
2. Durable Objects (one room per DO, authoritative real-time state).
3. D1 (hosts, rooms, players, teams, scores, event logs, snapshots).
4. R2 (optional avatar image storage).
5. Queues (optional async tasks: analytics, image processing, session post-processing).

## 10.2 Route model
No separate Pages project per game.
Single app routes:
- `/host/login`
- `/host` (primary mirrored host/TV runtime view)
- `/join/:roomId`
- `/controller/:roomId`
- `/room/:roomId` (legacy/diagnostic host display; may mirror `/host` behavior)

Primary host auth APIs:
- `POST /api/auth/host/login` (code-based direct login + first-login activation)

Controller UI switches by real-time state payload from Durable Object.

Host UI also switches by room/game stage payload, preserving server authority for room progression and scoring.

## 10.3 Feasibility statement
Cloudflare Workers Paid + Durable Objects + D1 is sufficient for this use case if WebSocket hibernation and room lifecycle controls are implemented to control duration costs.

## 11. Data Model (high-level)
1. `host_access_codes` (credential code inventory, activation/redeem status, activation/expiry timestamps, active host session nonce)
2. `hosts` (runtime host identity, active room pointer)
3. `rooms` (state, host, timestamps, timeout fields)
4. `players` (identity, avatar/emoji, connection metadata)
5. `teams` and `team_members`
6. `scores` (team-level snapshots)
7. `room_events` (append-only audit/event stream)
8. `game_sessions` and `trivia_questions`
9. `haraj_products`, `haraj_rounds`, and `haraj_submissions`

## 12. API + Event Contracts (high-level)
### 12.0 Landing support API
- `POST /api/chat/support` (landing chatbot prompt + reply)

## 12.1 Host actions
- `host.lockLobby`
- `host.assignPlayerTeam`
- `host.renameTeam`
- `host.heartbeat`
- `host.resumeSession`
- `host.selectAnotherResponder`
- `host.startTeams`
- `host.startGame`
- `host.startTrivia`
- `host.switchGame`
- `host.selectTriviaClue`
- `host.nextQuestion`
- `host.startHaraj`
- `host.startHarajRound`
- `host.nextHarajRound`
- `host.addTeamScore`
- `host.endSession`

## 12.2 Player actions
- `player.join`
- `player.reconnect`
- `player.input`
- `player.submitAnswer`
- `player.submitHarajEstimate`
- `player.heartbeat`

## 12.3 Server broadcasts
- `room.state`
- `room.score`
- `room.question`
- `room.controllerMode`
- `room.harajRound`
- `room.harajReveal`
- `room.error`

## 13. Security Requirements
1. Keep host credential inventory server-authoritative and never expose privileged auth state to clients.
2. Sign host/player tokens with expiration and room binding.
3. Enforce role-based action authorization in Durable Object.
4. Validate all client actions server-side.
5. Add basic rate limiting and replay protection for critical actions.
6. Enforce host single-device session by validating token `sessionId` against server-side active session nonce.

## 14. Non-Functional Requirements
1. Score updates visible on host within near real-time (<300ms target in-region).
2. Reconnect should restore controller state in <2s target.
3. Session state must survive DO restarts through D1 snapshots + event replay.
4. Observability required for room errors, disconnects, and latency.

## 15. Milestones
## M1: Foundation
- Host auth, room creation, QR join, player registration, reconnect token.

## M2: Realtime Core
- Durable Object room state machine, WebSocket protocol, host/player synchronization.

## M3: Teaming + Scoreboard
- Team assignment, team-only scoring model, persistent snapshots.

## M4: Trivia v1 + Haraj v1
- Jeopardy board flow, buzzer lock, responder fairness, live score commits.
- Haraj round flow, 15-second estimate collection, hidden answers until reveal, tie-aware scoring.

## M5: Reliability + Scale Hardening
- Timeout enforcement, load tests for target concurrency, observability + alerts.

## 16. Success Metrics
1. Room creation success rate.
2. Player join success rate.
3. Reconnect success rate.
4. Median host score-update latency.
5. Session completion rate.

## 17. Open Decisions
1. Whether to tune point ladder/timers beyond current defaults (`10-50`, `5s` countdown, `20s` buzz window).
2. Question source and authoring workflow (seeded DB vs external CMS).
3. Whether to support mid-game late join for players.
4. Required minimum question count per room based on player count policy.
5. Final WhatsApp support number value to use in landing chatbot fallback response.
