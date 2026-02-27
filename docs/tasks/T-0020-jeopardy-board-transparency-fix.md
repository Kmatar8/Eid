# T-0020: Jeopardy Board Transparency Fix

- Status: done
- Milestone: M4
- PRD Reference: 6, 14

## Objective
Ensure the Jeopardy board container on the host screen visibly renders with 50% black transparency.

## Scope
### In
1. Fix host Jeopardy board container background so `50%` transparency is clearly visible.
2. Keep existing layout, interactions, and game logic unchanged.

### Out
1. Gameplay rule changes.
2. Controller UI changes.
3. Fireworks or modal behavior changes.

## Dependencies
1. `app/host/page.tsx`

## API / Events / Contracts Impacted
1. None.

## Data Model Impact
1. No D1 schema changes.
2. No Durable Object state changes.
3. No KV/R2 changes.

## Implementation Plan
1. Update Jeopardy board wrapper styles to use an explicit 50% black background with high precedence.
2. Keep the existing border/blur/shadow shell style.
3. Validate with lint.

## Acceptance Criteria
1. Jeopardy board area is visibly transparent (black at ~50% opacity) on host screen.
2. No functional behavior changes to question selection or modal.
3. Lint passes.

## Validation Checklist
- [x] Lint pass.
- [ ] Manual: Jeopardy board transparency is visibly 50% black.

### Validation Evidence
1. Updated Jeopardy board wrapper to an explicit inline background: `rgba(0, 0, 0, 0.5)` in `app/host/page.tsx`.
2. `npm run lint` passed (warnings only, no errors).

## Rollback Plan
1. Revert `app/host/page.tsx` board wrapper style change.

## Notes / Risks
1. Global class backgrounds can override utility classes; explicit inline background style is used to avoid override ambiguity.
