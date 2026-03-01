# T-0046: Chatbot WhatsApp Escalation Number Finalization

- Status: done
- Milestone: M1
- PRD Reference: 6.4, 17

## Objective
Finalize and apply the WhatsApp escalation number for chatbot fallback responses.

## Scope
### In
1. Set fallback WhatsApp number to `0576216613` in chatbot content.
2. Set fallback WhatsApp number to `0576216613` in server-side default fallback message.
3. Update PRD to mark WhatsApp number decision as finalized.

### Out
1. Chatbot behavior changes outside escalation number text.
2. UI layout changes.
3. External API integration changes.

## Dependencies
1. `public/chatbot/fallback-message.md`
2. `app/api/chat/support/route.ts`
3. `PRD.md`

## API / Contract Impact
1. No contract shape changes.
2. Fallback reply text is updated with final support number.

## Data Model Impact (D1/DO/R2)
1. D1: no change.
2. DO: no change.
3. R2: no change.

## Implementation plan
1. Replace placeholder number in fallback markdown content.
2. Replace placeholder number in route default fallback message constant.
3. Update PRD chatbot section and open decisions section.
4. Run focused lint for modified route file.
5. Record validation evidence and mark done.

## Acceptance criteria
1. Chatbot fallback message includes `0576216613`.
2. Runtime default fallback also includes `0576216613`.
3. PRD no longer leaves WhatsApp number as unresolved open decision.

## Validation checklist
- [x] Focused lint/type check.
- [x] Manual code verification of updated fallback number.

## Validation evidence (2026-03-01)
1. Updated fallback number in chatbot content:
   - `public/chatbot/fallback-message.md` now uses `0576216613`.
2. Updated runtime default fallback:
   - `app/api/chat/support/route.ts` constant `DEFAULT_FALLBACK_MESSAGE` now uses `0576216613`.
3. PRD updated:
   - Added finalized WhatsApp escalation number under section `6.4`.
   - Removed unresolved WhatsApp-number item from `17. Open Decisions`.
4. Focused lint:
   - `npx eslint app/api/chat/support/route.ts` ✅

## Rollback plan
1. Revert fallback message and default constant to previous placeholder value.
2. Revert PRD decision update.

## Notes/risks
1. If support number changes again, update both fallback markdown and route default.
