# T-0013: Near-Realtime Sync Alignment (Host + Controllers)

- Status: done
- Milestone: M4
- PRD Reference: 6, 8.2, 14

## Objective
Reduce visible host/controller drift (countdown, buzzer, result reveal) by aligning client clocks to server timestamps and using adaptive polling frequencies during active trivia phases.

## Scope
### In
1. Add client-side server clock offset calibration from API envelope `ts`.
2. Use calibrated time for countdown/buzzer/answer timers on host/controller.
3. Replace static poll intervals with adaptive phase-aware intervals.
4. Keep visibility-aware and overlap-safe polling protections.
5. Add visibility-change immediate refresh to recover quickly after tab focus.

### Out
1. WebSocket/SSE architecture migration.
2. Game rules changes.
3. API payload shape changes.

## Dependencies
1. Existing envelope timestamp (`ServerEnvelope.ts`).
2. Existing host/controller polling architecture.

## API / Contract Impact
1. No contract changes.
2. Existing fields reused (`ts`, `countdownEndsAt`, `buzzEndsAt`, `answerEndsAt`).

## Data Model Impact
1. D1: none.
2. Runtime state model: none.

## Implementation Plan
1. Add server time sync utility logic in host/controller pages.
2. Update timer ticks to use synchronized clock value.
3. Replace polling effect with adaptive interval scheduling by room phase.
4. Add visibility-change immediate fetch handlers.
5. Validate via lint/build.

## Acceptance Criteria
1. Countdown/buzzer/answer timers show materially reduced drift across devices.
2. Result and state transitions propagate faster in active phases.
3. Idle phases remain lower-frequency to avoid unnecessary load.
4. Lint/build pass.

## Validation Checklist
- [x] Lint pass.
- [x] Build pass.
- [x] Manual-ready: host + controllers now use server-time calibration + fast active-phase polling.
- [x] Manual-ready: reveal latency gap reduced via adaptive polling in active phases.

## Validation Evidence
1. `npm run lint` passed with warnings only (no errors).
2. `npm run build` passed.
3. Code-level verification:
   - Server envelope `ts` is now used to continuously calibrate client clock offset.
   - Countdown/buzzer/answer timers use synchronized `nowTs`.
   - Polling interval is now dynamic (fast in active question phases, slower elsewhere).
   - Visibility-change triggers immediate refresh to resync quickly when tabs regain focus.

## Rollback Plan
1. Revert host/controller polling and time-sync edits.
2. Revert task file.

## Notes / Risks
1. Polling-based sync still has residual network jitter; this is an incremental improvement short of websocket push.
