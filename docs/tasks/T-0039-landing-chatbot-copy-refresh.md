# T-0039: Landing Chatbot Copy Refresh

- Status: done
- Milestone: M1
- PRD Reference: 6.4

## Objective
Update landing chatbot UI copy to the latest approved Arabic text.

## Scope
### In
1. Replace chatbot title text.
2. Replace initial assistant greeting message.
3. Replace chatbot subtitle text.

### Out
1. Any behavior/API changes.
2. Any layout or styling changes.
3. KB/system prompt changes.

## Dependencies
1. `components/landing/landing-chatbot-widget.tsx`

## API / Contract Impact
1. None.

## Data Model Impact (D1/DO/R2)
1. D1: no change.
2. DO: no change.
3. R2: no change.

## Implementation plan
1. Update the three requested strings in chatbot widget.
2. Run focused lint for changed file.
3. Record validation evidence and mark done.

## Acceptance criteria
1. Chatbot title is `سارة`.
2. Initial message is `هلا فيك وكل عام وانت بخير وكل من يعز عليك، قولي كيف اقدر اساعدك .`.
3. Subtitle is `دعم فني ٢٤ ساعة`.

## Validation checklist
- [x] Focused lint/type check.
- [x] Manual code verification.

## Validation evidence (2026-03-01)
1. Updated strings in `components/landing/landing-chatbot-widget.tsx`:
   - Title: `مساعد هروف` -> `سارة`
   - Initial message: `هلا! أنا مساعد هروف. اسألني عن طريقة اللعب أو تفاصيل المنتج.` -> `هلا فيك وكل عام وانت بخير وكل من يعز عليك، قولي كيف اقدر اساعدك .`
   - Subtitle: `إجابات سريعة من قاعدة المعرفة` -> `دعم فني ٢٤ ساعة`
2. Focused lint:
   - `npx eslint components/landing/landing-chatbot-widget.tsx` ✅

## Rollback plan
1. Restore previous three strings in chatbot widget.

## Notes/risks
1. Copy-only change with no runtime behavior risk.
