# T-0005: Reliability + Scale Hardening (Timeouts, Cost, Observability, Load)

- Status: in_progress
- Milestone: M5
- PRD Reference: 7, 7.3, 10, 10.3, 14, 16

## Objective
Harden the platform for peak concurrency (`1,000-5,000` concurrent rooms) with reliable lifecycle handling, Durable Object cost controls, reconnect stability, and actionable observability.

## Scope
### In
1. Enforce room timeout policies in runtime and persistence.
2. Durable Object websocket hibernation and idle-cost optimization.
3. Host disconnect handling and `paused_wait_host` resume/expiry logic.
4. Retry/idempotency hardening for critical host actions.
5. Structured logging, metrics, and alert thresholds.
6. Load testing scenarios and baseline performance report.

### Out
1. Product feature changes unrelated to reliability.
2. New game modes.
3. BI dashboard implementation.

## Dependencies
1. `T-0001`, `T-0002`, `T-0003`, `T-0004` implemented.
2. Cloudflare bindings and environments available for staging load tests.
3. Logging/metrics sink selection confirmed.

## API / Contract Impact
1. Lifecycle error codes for timeout/expiry/superseded states.
2. Optional server broadcast for room expiration warnings:
- `room.warning`
- `room.expired`
3. Idempotency key support for critical host commands:
- `host.createTeams`
- `host.startGame`
- `host.nextQuestion`
- `host.endSession`

## Data Model Impact
1. Add/ensure room lifecycle timestamps:
- `last_activity_at`
- `paused_at`
- `expires_at`
- `completed_at`
2. Optional reliability table:
- `room_runtime_metrics(room_id, metric_type, metric_value, created_at)`
3. Optional idempotency ledger:
- `room_command_dedup(room_id, command_id, command_type, created_at)`

## Implementation Plan
1. Implement lifecycle enforcer module:
- evaluate room state + timestamps
- transition to `expired`/`superseded` deterministically
2. Add host disconnect policy:
- move to `paused_wait_host`
- allow resume within grace window
- expire when grace exceeded
3. Add websocket hibernation support and verify wake-up flow.
4. Implement idempotency for critical host commands.
5. Add standardized structured logs for:
- connect/disconnect
- state transitions
- errors
- command processing latency
6. Add performance counters:
- join latency
- broadcast latency
- reconnect restoration latency
7. Create load test scripts:
- 1k rooms smoke profile
- 5k rooms peak profile
- reconnect storm profile
8. Run load tests in staging and document results.
9. Tune hotspots:
- payload sizes
- broadcast frequency
- persistence batching
10. Produce reliability readiness report and open follow-up tasks if needed.

## Acceptance Criteria
1. Room timeout rules are enforced exactly as PRD policy.
2. Host disconnect/resume behavior works with grace window.
3. Expired/superseded rooms reject join/reconnect with deterministic errors.
4. Critical host commands are idempotent under retries.
5. Reconnect restores active state reliably during load.
6. Load test report produced for 1k and 5k room scenarios.
7. Observability dashboards/log queries can diagnose room failures quickly.
8. No critical reliability regression in end-to-end gameplay path.

## Validation Checklist
- [x] Lint/typecheck pass.
- [ ] Integration tests for timeout and disconnect-resume flows.
- [x] Integration-style validation for idempotent host command replay (`requestId`).
- [ ] Staging load test completed at 1k rooms.
- [ ] Staging load test completed at 5k rooms.
- [ ] Reconnect storm test completed.
- [ ] Reliability report documented with metrics and bottlenecks.

## Progress Notes (2026-02-22)
1. Added host command idempotency in store (`processedHostCommandsByRoom`) keyed by `requestId`.
2. Verified duplicate `host.addTeamScore` with same `requestId` does not double-increment score.
3. Timeout lifecycle checks from M1 remain active (`lobby_timeout`, `paused_timeout`, `hard_cap`).
4. Remaining work: load generation, latency metrics, and staged reliability report.

## Rollback Plan
1. Disable lifecycle enforcer feature flag and revert to baseline behavior.
2. Disable idempotency ledger if causing false rejections.
3. Roll back hibernation-related connection changes if stability issues appear.
4. Revert to previous stable deployment and preserve logs for root-cause analysis.

## Risks / Notes
1. Load test realism risk if action patterns differ from production behavior.
2. Over-logging can increase costs; sampling strategy may be required.
3. Hibernation misuse can cause stale connection assumptions.
4. Timeout edge races require deterministic server clocks and transition guards.
