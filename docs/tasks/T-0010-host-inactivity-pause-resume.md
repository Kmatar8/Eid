# T-0010: Host Inactivity Detection + Pause/Resume Session

- Status: done
- Milestone: M5
- PRD Reference: 7.2, 7.3, 9, 12, 14

## Objective
Implement host inactivity handling so active sessions move to `paused_wait_host` when host is absent, provide explicit host resume flow, and expire paused rooms after grace timeout.

## Scope
### In
1. Add host presence heartbeat action (`host.heartbeat`).
2. Detect host inactivity during active non-lobby stages and transition room to `paused_wait_host` (threshold: `10 minutes`).
3. Add host resume action (`host.resumeSession`) to restore pre-pause room state.
4. Enforce `paused_wait_host` grace expiry (`20 minutes`) to `expired`.
5. Add host UI paused state messaging + resume CTA.
6. Add controller messaging when room is paused waiting for host.

### Out
1. WebSocket presence tracking (heartbeat remains HTTP polling-based).
2. Database schema migrations (runtime/in-memory only).
3. Admin analytics for inactivity events.

## Dependencies
1. Existing room lifecycle engine in `lib/server/store.ts`.
2. Existing polling model in host/controller pages.
3. Existing protocol/action route handling.

## API / Contract Impact
1. Add host action: `host.heartbeat`.
2. Add host action: `host.resumeSession`.
3. Add room event records for pause/resume transitions.

## Data Model Impact
1. D1: no schema change.
2. Runtime: add in-memory host last-seen timestamps and paused-from-state tracking.
3. R2: no impact.

## Implementation Plan
1. Update PRD + task docs.
2. Extend protocol host actions.
3. Add inactivity detection + pause/resume transitions in store timeout/action logic.
4. Add host heartbeat loop in host page.
5. Add host paused state view + resume action.
6. Add controller paused-state messaging and guardrails.
7. Validate with lint/build and live smoke flow.

## Acceptance Criteria
1. If host is inactive for `10 minutes` while room is active (non-lobby), room transitions to `paused_wait_host`.
2. Host can resume room via `host.resumeSession` before grace expiry.
3. If pause lasts beyond `20 minutes`, room expires.
4. Host screen clearly shows paused state and resume action.
5. Controller clearly shows paused-wait-host state and disables gameplay actions.
6. Existing gameplay and room lifecycle still pass lint/build and smoke checks.

## Validation Checklist
- [x] Lint/typecheck pass.
- [x] Build pass.
- [x] Simulated: host inactivity -> room enters `paused_wait_host`.
- [x] Simulated: resume from paused state returns to prior active state.
- [x] Simulated: paused room expires after grace timeout.
- [x] Controller guardrails updated for paused state (message + disabled buzz/answer by state).

## Validation Evidence
1. `npm run lint` passed (warnings only, no errors).
2. `npm run build` passed.
3. Timeout simulation command:
   - `npx --yes tsx .tmp-host-timeouts.ts` (temporary local script removed after run)
   - Output:
     - `pausedState: paused_wait_host`
     - `resumedState: teams_ready`
     - `expiredState: expired`
4. Policy update: `PRD.md` section `7.3` now specifies host inactivity detection threshold as `10 minutes`.
5. Runtime update: `lib/server/store.ts` `HOST_INACTIVITY_MS` set to `10 * 60 * 1000`.

## Rollback Plan
1. Revert protocol additions (`host.heartbeat`, `host.resumeSession`).
2. Revert store inactivity/pause-resume logic.
3. Revert host/controller paused-state UI.
4. Redeploy previous stable release.

## Notes / Risks
1. Inactivity detection is polling/heartbeat based, not socket-presence based.
2. If no clients poll the room, timeout transitions happen on next request boundary.

## Progress Notes
1. Tuning update (2026-02-28): increase host inactivity threshold from `1 minute` to `10 minutes` before transitioning room to `paused_wait_host`.
