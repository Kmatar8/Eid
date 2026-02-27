# T-0022: Fireworks Population Reduction (50%)

- Status: done
- Milestone: M4
- PRD Reference: 6, 14

## Objective
Reduce fireworks population by 50% across active UI surfaces.

## Scope
### In
1. Halve all explicit fireworks `population` values on host, landing, host login, and celebration pages.
2. Preserve current visuals/logic besides density.

### Out
1. Fireworks engine behavior changes.
2. Gameplay/session logic changes.
3. Color/theme/layout redesign.

## Dependencies
1. `app/host/page.tsx`
2. `app/page.tsx`
3. `app/host/login/page.tsx`
4. `app/eid-celebration/page.tsx`

## API / Events / Contracts Impacted
1. None.

## Data Model Impact
1. No D1 schema changes.
2. No Durable Object state changes.
3. No KV/R2 changes.

## Implementation Plan
1. Update hardcoded fireworks population values to 50% of current values.
2. Keep all other parameters unchanged.
3. Validate with lint.

## Acceptance Criteria
1. Fireworks population is reduced by 50% on all updated pages.
2. Build/lint quality remains unchanged.

## Validation Checklist
- [x] Lint pass.
- [ ] Manual: fireworks density visibly lower on updated pages.

### Validation Evidence
1. Halved fireworks populations in:
   - `app/host/page.tsx`
   - `app/page.tsx`
   - `app/host/login/page.tsx`
   - `app/eid-celebration/page.tsx`
2. `npm run lint` passed (warnings only, no errors).

## Rollback Plan
1. Revert affected page files to previous population values.

## Notes / Risks
1. Decimal population values are intentional (e.g., `1.5` from `3`) and supported by the current fireworks scheduling logic.
