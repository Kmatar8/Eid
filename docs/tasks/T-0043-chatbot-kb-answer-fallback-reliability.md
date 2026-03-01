# T-0043: Chatbot KB Answer Fallback Reliability

- Status: done
- Milestone: M1
- PRD Reference: 6.4, 12.0

## Objective
Prevent repetitive generic fallback replies by returning a useful KB-derived answer when KB sections match but Gemini call/config fails.

## Scope
### In
1. Improve chatbot fallback behavior to prefer KB-derived reply for matched questions.
2. Expand built-in default KB/system content to align with current host knowledge content.
3. Preserve strict out-of-KB fallback to WhatsApp message.

### Out
1. UI redesign.
2. New external services.
3. Data persistence changes.

## Dependencies
1. `app/api/chat/support/route.ts`
2. `public/chatbot/knowledge-base.md`

## API / Contract Impact
1. No request schema change.
2. Response may include additional source values (`kb_fallback`) while preserving existing `reply` field.

## Data Model Impact (D1/DO/R2)
1. D1: no change.
2. DO: no change.
3. R2: no change.

## Implementation plan
1. Add KB snippet response builder for matched sections.
2. Use KB snippet response when Gemini key missing/error/invalid output.
3. Keep pure fallback message only for no-match questions.
4. Run focused lint and local API smoke tests.

## Acceptance criteria
1. Relevant host questions no longer always return the same WhatsApp fallback when Gemini fails.
2. Non-KB questions still return WhatsApp fallback.
3. API remains backward compatible for frontend consumption.

## Validation checklist
- [x] Focused lint/type check.
- [x] Local API smoke for matched and non-matched queries.

## Validation evidence (2026-03-01)
1. Route fallback behavior updated in `app/api/chat/support/route.ts`:
   - Added deterministic KB-derived response builder for matched sections.
   - Uses `source: "kb_fallback"` when Gemini is missing/fails/returns invalid output.
   - Keeps `source: "fallback"` only for no-match questions.
2. Matching quality improved:
   - Added Arabic token normalization (`أ/إ/آ`, `ى`, `ة`) and stopword filtering to reduce false positives.
3. Focused lint:
   - `npx eslint app/api/chat/support/route.ts` ✅
4. Local API smoke:
   - Query `كيف العب؟` => KB-derived response (`source: "kb_fallback"`) ✅
   - Query `وش عاصمة اليابان` => WhatsApp fallback (`source: "fallback"`) ✅

## Rollback plan
1. Revert route fallback behavior to previous generic fallback-only mode.

## Notes/risks
1. KB-derived fallback is deterministic and shorter than model-generated answers.
2. This change improves reliability under API/config failures.
