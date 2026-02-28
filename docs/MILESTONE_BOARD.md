# Milestone Board

This board tracks implementation order, ownership, and execution status.

## Global Status Keys
- `planned`
- `in_progress`
- `blocked`
- `done`

## Priority Sequence
1. `T-0001` Foundation
2. `T-0002` Realtime Core
3. `T-0003` Teaming + Scoreboard
4. `T-0004` Trivia v1
5. `T-0005` Reliability + Scale Hardening

## Board
| Order | Task ID | Milestone | Title | Status | Owner | Blocked By | Notes |
|---|---|---|---|---|---|---|---|
| 1 | T-0001 | M1 | Foundation - Host Auth, Room Lifecycle, QR Join, Reconnect | done | AI-Agent | - | First executable slice completed |
| 2 | T-0002 | M2 | Realtime Core - Room WebSocket Protocol and State Sync | done | AI-Agent | T-0001 | Protocol core delivered (HTTP diff transport) |
| 3 | T-0003 | M3 | Teaming + Team Scoreboard Persistence | done | AI-Agent | T-0001, T-0002 | Team model and score persistence implemented |
| 4 | T-0004 | M4 | Trivia v1 Gameplay Engine (Primary + Steal) | done | AI-Agent | T-0001, T-0002, T-0003 | Trivia v1 gameplay flow implemented |
| 5 | T-0005 | M5 | Reliability + Scale Hardening (Timeouts, Cost, Observability, Load) | in_progress | AI-Agent | T-0001, T-0002, T-0003, T-0004 | Idempotency added; load/metrics pending |
| 6 | T-0006 | M4 | Live E2E Testing Surface (Host/Join/Controller/Room) | done | AI-Agent | T-0001, T-0002, T-0003, T-0004 | Host/join/controller/room test surfaces + smoke script delivered |
| 7 | T-0007 | M4 | Controller UX Simplification + Submit Reliability | done | AI-Agent | T-0006 | Controller simplified; submit reliability hardening deployed |
| 8 | T-0008 | M4 | Production Host Journey UI (Landing -> Login -> Lobby -> Game -> Celebration) | in_progress | AI-Agent | T-0006, T-0007 | User-approved staged host flow and TV-first UX |
| 9 | T-0026 | M5 | Room-Scoped DO Autoscaling + Low-Latency Realtime | in_progress | AI-Agent | T-0005 | Phase 2 advanced: DO delta publish, host action idempotency enforcement, per-room host rate limiting, DO ws/alarm groundwork + 100-room load harness |

## Execution Rules
1. Only one `in_progress` task per milestone unless explicitly approved.
2. A task can move to `done` only when its DoD in `AGENTS.md` is satisfied.
3. If a task is blocked, add blocker details and a decision owner in `Notes`.
4. Update this board whenever a task status changes.

## Current Focus
- In progress: `T-0005`, `T-0008`, `T-0026`
- Next recommended start after completion: staged load test + reliability report
