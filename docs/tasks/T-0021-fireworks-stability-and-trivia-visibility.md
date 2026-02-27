# T-0021: Fireworks Stability and Trivia Visibility

- Status: done
- Milestone: M5
- PRD Reference: 6, 14

## Objective
Fix unreliable fireworks rendering on the host Jeopardy stage and ensure fireworks are clearly visible (while still lower intensity than landing).

## Scope
### In
1. Stabilize fireworks effect lifecycle to avoid repeated re-initialization loops during host state updates.
2. Ensure scheduled firework timers are properly cleaned up on effect teardown.
3. Improve canvas sizing robustness for full-screen host stage.
4. Tune Jeopardy stage fireworks population/opacity to remain visibly active but lower than landing.

### Out
1. Game logic, scoring, or timers.
2. Controller UI changes.
3. Landing page design changes.

## Dependencies
1. `components/ui/fireworks.tsx`
2. `app/host/page.tsx`

## API / Events / Contracts Impacted
1. None.

## Data Model Impact
1. No D1 schema changes.
2. No Durable Object state changes.
3. No KV/R2 changes.

## Implementation Plan
1. Replace reference-unstable effect dependencies with value-stable dependencies in fireworks component.
2. Add controlled timeout lifecycle (store timeout ID and clear on cleanup).
3. Use container dimensions directly for canvas sizing with DPR-aware rendering.
4. Adjust host trivia fireworks population to stay below landing while still visible.
5. Validate with lint.

## Acceptance Criteria
1. Fireworks continue rendering on host Jeopardy stage without stalling during live state updates.
2. Trivia-stage fireworks are visibly present and less dense than landing page fireworks.
3. No regressions in page rendering or interaction.
4. Lint passes.

## Validation Checklist
- [x] Lint pass.
- [ ] Manual: Jeopardy stage fireworks remain visible during live gameplay.
- [ ] Manual: Trivia-stage fireworks density is lower than landing.

### Validation Evidence
1. `components/ui/fireworks.tsx` now uses stable primitive effect dependencies and clears recursive firework launch timeouts on cleanup.
2. Canvas sizing now uses container width/height with DPR-aware scaling for consistent rendering on host full-screen layouts.
3. `app/host/page.tsx` trivia stage fireworks tuned to lower density than landing (`base=1`, `demo=2`) with expanded explosion band for visibility.
4. `npm run lint` passed (warnings only, no errors).
5. `npm run build` passed successfully.

## Rollback Plan
1. Revert changes in `components/ui/fireworks.tsx`.
2. Revert host fireworks tuning in `app/host/page.tsx`.

## Notes / Risks
1. Fireworks are canvas-based and can be affected by low-power mobile browser throttling; this fix targets deterministic lifecycle behavior first.
