# T-0057: Landing Social Row Layout Adjustment

- Status: done
- Milestone: M1
- PRD Reference: 6.6, 15

## Objective
Adjust landing hero layout so the TikTok profile container appears beside the festive pill below it.

## Scope
### In
1. Update landing header markup/layout to place TikTok profile chip and festive pill in one row.
2. Keep responsive behavior (wrap gracefully on small screens).

### Out
1. Copy/text changes.
2. CTA and hero image behavior changes.
3. Chatbot widget changes.

## Dependencies
1. `app/page.tsx`
2. `PRD.md`

## API / Contracts Impacted
1. No API/event contract changes.

## Data Model Impact (D1/DO/R2)
1. D1: no change.
2. DO: no change.
3. R2: no change.

## Implementation plan
1. Add PRD visual requirement for landing social row.
2. Refactor landing header chips into a single responsive flex row.
3. Run focused lint + typecheck/build and record evidence.

## Acceptance criteria
1. TikTok profile container is rendered beside the festive pill.
2. Layout remains responsive on small screens.
3. Build passes.

## Validation checklist
- [x] Focused lint passes for landing page.
- [x] Typecheck passes.
- [x] Build passes.

## Validation evidence (2026-03-01)
1. Focused lint:
   - `npx eslint app/page.tsx` ✅ (warnings only, no errors)
2. Typecheck:
   - `npx tsc --noEmit` ✅
3. Build:
   - `npm run build` ✅
4. UI change:
   - TikTok profile chip and festive pill are now rendered in one responsive flex row within landing header.

## Rollback plan
1. Revert landing header chip layout block in `app/page.tsx`.
2. Revert PRD and task updates.

## Notes/risks
1. On narrow screens, row may wrap by design to preserve readability.
