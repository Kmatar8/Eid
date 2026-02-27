# T-0024: Host Modal Floating Score Feedback

- Status: done
- Milestone: M4
- PRD Reference: 6, 14

## Objective
Make the score delta in the host question modal float together with the large correct/incorrect icon, with no extra score icon visuals.

## Scope
### In
1. Update reveal feedback block animation so icon and score float together.
2. Keep score display as plain `+20` / `-20` text only.
3. Preserve current reveal logic and button behavior.

### Out
1. Game logic or scoring calculations.
2. Controller UI changes.
3. Session/room lifecycle changes.

## Dependencies
1. `app/host/page.tsx`

## API / Events / Contracts Impacted
1. None.

## Data Model Impact
1. No D1 schema changes.
2. No Durable Object state changes.
3. No KV/R2 changes.

## Implementation Plan
1. Refactor reveal points/icon block to a shared floating motion container.
2. Remove any extra score visual element and keep text-only delta.
3. Validate with lint.

## Acceptance Criteria
1. Large result icon floats.
2. Score delta text floats with the icon.
3. No additional score icon appears.

## Validation Checklist
- [x] Lint pass.
- [ ] Manual: icon + score both float during reveal.

### Validation Evidence
1. Host reveal feedback block updated so icon and score delta (`+/-`) animate in a shared floating motion container.
2. Score remains plain text only with no additional iconography.
3. `npm run lint` passed (warnings only, no errors).

## Rollback Plan
1. Revert `app/host/page.tsx` reveal feedback block.

## Notes / Risks
1. Animation remains presentation-only and does not alter result timing/state.
