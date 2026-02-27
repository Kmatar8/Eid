# T-0003: Teaming + Team Scoreboard Persistence

- Status: done
- Milestone: M3
- PRD Reference: 6, 7, 8.3, 9, 11, 12, 14

## Objective
Implement deterministic team assignment, persistent team membership, and authoritative team-only scoreboard updates visible in real time on the host screen.

## Scope
### In
1. Team creation and assignment flow after lobby lock.
2. Team data persistence (`teams`, `team_members`).
3. Team-only score model (`team_a_score`, `team_b_score`).
4. Realtime scoreboard updates via Durable Object broadcasts.
5. Score persistence checkpoints and replay-safe recovery.
6. Host controls for teaming lifecycle:
- `host.lockLobby`
- `host.createTeams`
- `host.adjustTeam` (optional for manual override)

### Out
1. Trivia question engine and per-question answer logic (M4).
2. Individual player scoreboards.
3. Multi-team (>2) modes in v1.
4. Rich historical analytics dashboards.

## Dependencies
1. `T-0001` completed (auth/room/join/reconnect).
2. `T-0002` completed (websocket protocol + state sync).
3. Room state machine has `lobby_open`, `lobby_locked`, `teams_ready` transitions.

## API / Contract Impact
1. Host action messages:
- `host.lockLobby`
- `host.createTeams`
- `host.assignPlayerTeam` (if manual assignment enabled)
2. Server broadcasts:
- `room.teams`
- `room.score`
- `room.state`
3. Score update event payload includes:
- `roomId`
- `version`
- `teamScores`
- `reason`
- `ts`

## Data Model Impact
1. New D1 tables/indexes:
- `teams(team_id, room_id, team_name, team_order, created_at)`
- `team_members(room_id, player_id, team_id, joined_at)`
- `scores(room_id, version, team_a_score, team_b_score, reason, created_at)`
2. Constraint rules:
- one `team_members` row per player per room
- exactly 2 teams required for trivia mode
3. Optional room columns:
- `teams_finalized_at`
- `score_version`

## Implementation Plan
1. Add migration for teams/team_members/scores + indexes.
2. Implement team assignment algorithm:
- deterministic shuffle using room seed
- balanced split for player counts 20-30
3. Add DO command handling for `host.createTeams`:
- validate state `lobby_locked`
- assign all active players
- transition room to `teams_ready`
4. Implement realtime team broadcast after assignment.
5. Implement score state in DO:
- in-memory authoritative scores
- monotonic score version
6. Implement score checkpoint persistence:
- append row to `scores` on each score mutation
- periodic compact snapshot to room state if needed
7. Implement reconnect hydration:
- include teams and current score in `room.state` snapshot
8. Add guardrails:
- no score mutation before `game_live`
- idempotency for repeated host actions
9. Add tests and manual validation.

## Acceptance Criteria
1. Host can lock lobby and create two teams successfully.
2. Every joined player is assigned to exactly one team.
3. Team distribution is balanced (difference <= 1 player).
4. Host and players receive realtime team assignments.
5. Team score updates are broadcast immediately to host screen.
6. Team scores persist and survive DO restart/reconnect.
7. Duplicate score events are rejected or deduplicated via versioning.
8. Reconnected clients see correct teams + latest score snapshot.

## Validation Checklist
- [x] Lint/typecheck pass.
- [ ] Unit tests for assignment balancing and deterministic seed behavior.
- [ ] Unit tests for score version monotonicity and idempotency.
- [x] Integration-style flow for lock lobby -> create teams -> start game -> score update.
- [x] Manual: host state snapshot reflects score updates immediately.
- [x] Manual: reconnect/state fetch includes teams + score snapshot.

## Validation Evidence (2026-02-22)
1. Team model added to room snapshot (`teams`, `teamAssignments`).
2. Balanced deterministic assignment runs on `host.startTeams`.
3. Team scoring action added: `host.addTeamScore` (game-live only).
4. Smoke output verified:
- team split with 5 players -> `team_a:3`, `team_b:2`.
- score mutation -> `team_a:10`, `team_b:0`.
- room version increments and diff events include `room.score_updated`.

## Rollback Plan
1. Revert teaming and scoring handlers in DO.
2. Disable teaming host actions via feature toggle.
3. Roll back migration or mark tables unused until fixed.
4. Restore room flow to lobby-only mode if emergency fallback required.

## Risks / Notes
1. Teaming race conditions if players join exactly at lock boundary.
2. Score drift risk if mutation allowed outside authoritative DO path.
3. Duplicate message retries require strict idempotency keys/version checks.
4. Keep score payloads compact to reduce websocket bandwidth.
