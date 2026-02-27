# T-0025: Host Modal Score Under Main Result Icon

- Status: done
- Milestone: M4
- PRD Reference: 6, 14

## Objective
Align reveal feedback with requested behavior: keep the main correct/incorrect icon, show only score text underneath, and remove extra icon/bounce effects.

## Scope
### In
1. Remove secondary icon from host question modal result block.
2. Keep only score delta text (`+/-`) under the main icon.
3. Remove score floating/bouncing motion.
4. Keep existing reveal logic and answer coloring.

### Out
1. Scoring/gameplay logic changes.
2. Controller UI changes.
3. Session lifecycle behavior changes.

## Dependencies
1. `app/host/page.tsx`

## API / Events / Contracts Impacted
1. None.

## Data Model Impact
1. No D1 schema changes.
2. No Durable Object state changes.
3. No KV/R2 changes.

## Implementation Plan
1. Simplify reveal score block to text-only display.
2. Remove extra icon and bounce animation.
3. Validate with lint.

## Acceptance Criteria
1. Only one icon remains (the main result icon).
2. Score text appears below it (`+20`, `-20`, etc.).
3. No score bouncing animation.

## Validation Checklist
- [x] Lint pass.
- [ ] Manual: UI shows one icon + score text below without bouncing.

### Validation Evidence
1. Removed secondary result icon from host modal reveal block.
2. Score delta is now text-only with simple fade/scale in, no floating bounce loop.
3. `npm run lint` passed (warnings only, no errors).

## Rollback Plan
1. Revert `app/host/page.tsx` reveal score block.

## Notes / Risks
1. Presentation-only change; no runtime game-state impact.
