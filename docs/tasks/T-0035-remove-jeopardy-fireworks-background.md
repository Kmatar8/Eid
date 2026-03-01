# T-0035: Remove Jeopardy Fireworks Background

- Status: in_progress
- Milestone: M4
- PRD Reference: 6.1 (host screen), 8 (Trivia v1 flow), 15 (M4)

## Objective
Remove the animated fireworks background while Jeopardy (Trivia) is actively running, so the question/board experience is visually cleaner and less distracting.

## Scope
### In
1. Disable host-page background fireworks during Trivia stage (`stage === "trivia"`).
2. Keep existing background visuals and gameplay logic unchanged.

### Out
1. No changes to scoring, timing, buzzer, or room-state contracts.
2. No changes to Haraj visuals.
3. No changes to celebration overlays/confetti feedback behavior.

## Dependencies
1. Host runtime UI in `app/host/page.tsx`.
2. Existing stage derivation logic (`HostStage` / `stage`).

## API / Contracts Impacted
1. None.

## Data Model Impact (D1/DO/R2)
1. D1: no change.
2. Durable Object: no change.
3. R2: no change.

## Implementation plan
1. Add a stage guard for background fireworks rendering in host UI.
2. Render fireworks components only when not in Trivia stage.
3. Run local validation checks for touched scope.

## Acceptance criteria
1. When host is in Jeopardy stage, no fireworks background is rendered.
2. When host is outside Jeopardy stage, current fireworks behavior remains available.
3. No regressions in host page build/lint.

## Validation checklist
- [x] Focused lint passes for touched file(s).
- [x] Build passes.
- [ ] Manual host check confirms no fireworks during Jeopardy.

## Validation evidence (2026-03-01)
1. Focused lint:
   - `npx eslint app/host/page.tsx` ✅ (warnings only, no errors)
2. Build/type validation:
   - `npm run build` ✅
3. Manual host check:
   - Pending visual confirmation in host Jeopardy stage.

## Rollback plan
1. Revert `app/host/page.tsx` change to restore unconditional fireworks rendering.

## Notes/risks
1. Visual-only change; runtime/game-state risk is low.
