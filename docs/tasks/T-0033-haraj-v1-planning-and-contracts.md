# T-0033: Haraj v1 Planning and Contracts

- Status: in_progress
- Milestone: M4
- PRD Reference: 2, 6.1, 8.6, 11, 12, 15

## Objective
Define the implementation-ready scope for a new Haraj game mode where players estimate product prices, answers are revealed after lock, and team points are awarded to closest estimates.

## Scope
### In
1. Finalize Haraj round lifecycle and UI states for host and controller.
2. Define action/event contracts for Haraj host and player flows.
3. Define scoring and tie policy using absolute difference.
4. Define anti-stall behavior for zero-submission timeout rounds.
5. Define persistence requirements for Haraj rounds and submissions.

### Out
1. Runtime implementation of Haraj UI/state machine.
2. Product content pipeline/admin tooling.
3. Post-launch scoring variants (e.g., percentage error mode).

## Dependencies
1. Existing room lifecycle and state authority in Durable Object.
2. Existing team scoring pipeline and room score broadcasts.
3. Existing host/controller real-time delivery channels.

## API / Contracts Impacted
1. Host actions:
   - `host.startHaraj`
   - `host.startHarajRound`
   - `host.nextHarajRound`
2. Player actions:
   - `player.submitHarajEstimate`
3. Server broadcasts:
   - `room.harajRound`
   - `room.harajReveal`
   - Existing `room.score` updates for team totals

## Data Model Impact (D1/DO/R2)
1. D1:
   - Add/extend entities for `haraj_products`, `haraj_rounds`, `haraj_submissions`.
   - Persist actual price, per-player estimate, absolute difference, rank, and awarded points.
2. Durable Object:
   - Add Haraj round phases and timers in authoritative room state machine.
   - Enforce hidden estimates until round lock/reveal.
3. R2:
   - Optional product image assets (if external URLs are not used).

## Implementation Plan
1. Add Haraj state machine phases in room domain model and transition guards.
2. Implement fixed 15-second estimate collection window with early lock when all players submit.
3. Implement reveal computation:
   - absolute-difference ranking
   - tie handling by shared occupied-rank points
4. Implement anti-stall rule:
   - if submission count is zero at timeout, skip round with zero points for all teams
5. Build host UI states:
   - intro, collecting progress, reveal table, scoreboard
6. Build controller UI states:
   - estimate input, submitted waiting, reveal feedback
7. Persist round snapshots/events and integrate score broadcasts.
8. Add tests and manual scenarios for normal, tie, and no-submission rounds.

## Acceptance Criteria
1. Haraj round runs with fixed `15s` collection timeout.
2. Player estimates are hidden until lock/reveal, while submission status is visible.
3. Ranking uses `abs(estimate - actualPrice)` and ignores direction.
4. Equal absolute differences produce ties and share points across occupied ranks.
5. Team points are awarded only from Haraj top ranks (`50`, `30`, `10`) after tie-splitting.
6. If no players submit by timeout, round auto-skips and all teams receive `0` points for that round.
7. Host reveal includes actual price and all player estimates with absolute differences.
8. Controller reveal includes player estimate, actual price, and earned points.

## Validation Checklist
- [ ] Unit tests cover ranking, tie-sharing, and anti-stall zero-submission behavior.
- [ ] Integration tests cover host start -> collect -> lock/reveal -> score update flow.
- [ ] Manual scenario covers reconnect during collect/reveal without leaking hidden answers.
- [ ] Manual scenario confirms no-submission timeout auto-skip with zero points.
- [ ] Manual scenario confirms submission visibility without estimate visibility before reveal.

## Validation Evidence (2026-03-01)
1. Build/type validation:
   - `npm run build` ✅
2. Focused lint:
   - `npx eslint lib/server/types.ts lib/server/protocol-v1.ts lib/server/store.ts lib/server/haraj-bank.ts 'app/api/rooms/[roomId]/actions/route.ts' 'app/api/rooms/[roomId]/stream/route.ts' app/host/page.tsx 'app/controller/[roomId]/page-client.tsx' components/live/room-state-panel.tsx` ✅ (warnings only, no errors)
3. Implemented in this iteration:
   - Haraj state/snapshot model in room payload.
   - Host actions for Haraj lifecycle (`host.startHaraj`, `host.startHarajRound`, `host.nextHarajRound`).
   - Player estimate submission action (`player.submitHarajEstimate`).
   - Fixed 15-second round timeout with auto-reveal.
   - Anti-stall rule: zero-submission timeout auto-skip with zero points.
   - Tie-aware points sharing across occupied top-rank slots.
   - Host and controller runtime UI branches for Haraj collecting/reveal stages.
4. Remaining before marking done:
   - Manual end-to-end walkthrough for all acceptance scenarios.

## Rollback Plan
1. Gate Haraj behind feature flag and disable in game selection.
2. Revert Haraj-specific transitions/contracts while keeping Trivia flow unchanged.
3. Keep persisted Haraj tables/events inert (no runtime read path) until safe cleanup migration.

## Notes / Risks
1. Tie-sharing can produce fractional points; rounding policy must be explicitly defined before implementation.
2. Product difficulty calibration is needed to avoid repetitive or trivial rounds.
3. Hidden-answer guarantees must hold across reconnect and late message arrival.
