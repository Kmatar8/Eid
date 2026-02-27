# PRD: Hroof Realtime Party Game Platform

## 1. Document Control
- Version: `v0.1`
- Status: `Draft for implementation planning`
- Date: `2026-02-21`
- Product: `Hroof`

## 2. Product Summary
Hroof is a TV-first multiplayer party game platform where a host mirrors their phone to a TV and runs games in real time. Players join by scanning a QR code and use their phones as controllers.

Primary launch game is Jeopardy-style Trivia (4 multiple choices) with team-based scoring.

## 3. Goals
1. Deliver reliable real-time gameplay for live gatherings.
2. Allow frictionless joining via QR code.
3. Keep host display authoritative with live scoreboard updates.
4. Support persistent session data from lobby start to session end.
5. Support peak concurrency of `1,000-5,000` rooms.

## 4. Non-Goals (v1)
1. Public host self-signup (hosts use pre-generated credentials).
2. Complex admin panel UI.
3. Individual scoring leaderboard (team score only in v1).
4. Rich media chat/social feed.

## 5. Users and Access
### 5.1 Host
- Authenticates with pre-generated `username + password`.
- Constraint: one host can run only one active room at a time.
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
2. Host login page uses festive visual style and captures only username/password.
3. After login, host enters a TV-first lobby view that includes:
   - Large join QR code and join URL.
   - Live list of joined players.
   - Two team columns with host-controlled assignment interactions.
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

### 6.2 Controller Clarity Requirements (Trivia)
1. Controller view must clearly indicate whether the current question is for the current player or another player.
2. Controller must use team color cues consistent with host screen for active team context.
3. For active responder, controller shows explicit prompt like: `"X player, this question is for you."`
4. For non-active players, controller shows who should answer and from which team.
5. During buzzer phase, all players see a buzzer control and no answer choices until responder lock.

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
2. `paused_wait_host` grace: `20 minutes`.
3. Hard cap: `4 hours` from room creation.

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

Controller UI switches by real-time state payload from Durable Object.

Host UI also switches by room/game stage payload, preserving server authority for room progression and scoring.

## 10.3 Feasibility statement
Cloudflare Workers Paid + Durable Objects + D1 is sufficient for this use case if WebSocket hibernation and room lifecycle controls are implemented to control duration costs.

## 11. Data Model (high-level)
1. `hosts` (pre-generated credentials, active room pointer)
2. `rooms` (state, host, timestamps, timeout fields)
3. `players` (identity, avatar/emoji, connection metadata)
4. `teams` and `team_members`
5. `scores` (team-level snapshots)
6. `room_events` (append-only audit/event stream)
7. `game_sessions` and `trivia_questions`

## 12. API + Event Contracts (high-level)
## 12.1 Host actions
- `host.lockLobby`
- `host.assignPlayerTeam`
- `host.selectAnotherResponder`
- `host.startTeams`
- `host.startGame`
- `host.startTrivia`
- `host.selectTriviaClue`
- `host.nextQuestion`
- `host.addTeamScore`
- `host.endSession`

## 12.2 Player actions
- `player.join`
- `player.reconnect`
- `player.input`
- `player.submitAnswer`
- `player.heartbeat`

## 12.3 Server broadcasts
- `room.state`
- `room.score`
- `room.question`
- `room.controllerMode`
- `room.error`

## 13. Security Requirements
1. Store host passwords hashed using modern KDF.
2. Sign host/player tokens with expiration and room binding.
3. Enforce role-based action authorization in Durable Object.
4. Validate all client actions server-side.
5. Add basic rate limiting and replay protection for critical actions.

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

## M4: Trivia v1
- Jeopardy board flow, buzzer lock, responder fairness, live score commits.

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
