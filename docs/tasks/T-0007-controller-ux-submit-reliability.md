# T-0007: Controller UX Simplification + Submit Reliability

- Status: done
- Milestone: M4
- PRD Reference: 6, 8, 8.1, 8.2, 12, 14

## Objective
Improve the player controller experience by reducing UI to controller-essential elements only (question + answer options) and hardening submit behavior to avoid perceived double-tap requirements on mobile.

## Scope
### In
1. Simplify `/controller/:roomId` UI to controller-only surface.
2. Remove non-essential details from controller page (full room/player/team listings and extended diagnostics).
3. Improve answer submission reliability with mobile-friendly interaction and transient error retry handling.
4. Keep existing API contracts and game flow unchanged.

### Out
1. New game mechanics or scoring rules.
2. Host/TV route redesign.
3. Transport migration from polling to WebSocket.

## Dependencies
1. `T-0006` live routes and testing surface already deployed.
2. Existing action endpoint contracts remain stable.

## API / Contract Impact
1. No endpoint changes.
2. Uses existing `player.submitAnswer` contract (`payload.option` in `A|B|C|D`).

## Data Model Impact
1. None.

## Implementation Plan
1. Refactor controller page to minimal controller view.
2. Add explicit submit state lock to prevent duplicate/confusing taps.
3. Add retry-once behavior for transient submit failures.
4. Add touch-friendly answer button interactions and clear feedback states.
5. Validate with lint/build and live smoke flow.

## Acceptance Criteria
1. Controller page shows only what player needs for answering.
2. Non-responder players see only waiting state (no detailed room internals).
3. Answer button interaction is single-tap reliable under normal conditions.
4. Transient network submit failures auto-retry once before surfacing error.

## Validation Checklist
- [x] Lint/typecheck pass.
- [x] Build pass.
- [x] Manual: responder submits with one tap on mobile.
- [x] Manual: non-responder sees waiting state only.
- [x] Live smoke script still passes.

## Validation Evidence
1. `npm run lint` completed with warnings only (no errors).
2. `npm run build` completed successfully.
3. `BASE_URL=https://hroof-app.k-matar.workers.dev scripts/smoke-live.sh` passed end-to-end.
4. Live deploy completed to `https://hroof-app.k-matar.workers.dev` with version `a1476c19-beed-4f50-baad-1bce1a12ab6e`.

## Rollback Plan
1. Revert controller page changes and retry logic additions.
2. Restore previous controller UI component composition.
3. Redeploy last known stable worker version.

## Notes / Risks
1. Polling transport still has eventual consistency constraints compared with WebSockets.
2. Retry logic must avoid duplicate scoring side effects (server authority/idempotency remains source of truth).
