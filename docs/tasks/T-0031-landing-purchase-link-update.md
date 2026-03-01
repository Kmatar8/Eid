# T-0031: Landing Purchase Button Link Update

- Status: done
- Milestone: M1
- PRD Reference: 6.1

## Objective
Update the landing page purchase button so it opens the provided Salla checkout URL.

## Scope
### In
1. Change only the purchase button link target on the landing page hero section.
2. Keep button label, styling, and behavior (`window.open` in a new tab) unchanged.

### Out
1. Any visual redesign or copy change on landing page.
2. Checkout flow validation on external Salla platform.
3. Other CTA/button behavior changes.

## Dependencies
1. Landing page implementation in `app/page.tsx`.

## API / Contract Impact
1. None.

## Data Model Impact (D1/DO/R2)
1. D1: no change.
2. Durable Objects: no change.
3. R2: no change.

## Implementation plan
1. Locate current purchase button click handler on landing page.
2. Replace placeholder URL with provided Salla URL.
3. Run focused lint check on changed file.
4. Record validation evidence and mark task done.

## Acceptance criteria
1. Clicking "شراء اللعبة" opens `https://salla.sa/happyystoree/KRaxjOw` in a new tab.
2. No other landing page button behavior is changed.

## Validation checklist
- [x] Focused lint check passes for touched file.
- [x] Manual code verification confirms exact URL on purchase button click handler.

## Validation evidence (2026-03-01)
1. Updated `app/page.tsx` purchase button handler:
   - From: `window.open("#", "_blank")`
   - To: `window.open("https://salla.sa/happyystoree/KRaxjOw", "_blank")`
2. Focused lint check:
   - `npx eslint app/page.tsx` ✅ (no errors; existing warnings only)

## Rollback plan
1. Revert purchase button URL in `app/page.tsx` to previous value.
2. Re-run focused lint check.

## Notes/risks
1. External URL availability is owned by the destination platform, not this app.
