# T-0045: Chatbot Brand Name + Host Onboarding KB Expansion

- Status: done
- Milestone: M1
- PRD Reference: 6.4, 12.0

## Objective
Align chatbot naming to `جمعة العيد`, expand host-support knowledge base with practical onboarding details, and improve follow-up clarification handling to reduce unnecessary fallback replies.

## Scope
### In
1. Replace chatbot product naming in content/prompts from `هروف/حروف` to `جمعة العيد`.
2. Expand `knowledge-base.md` with detailed host signup/login, player onboarding, TV mirroring, and troubleshooting guidance.
3. Improve retrieval for follow-up prompts using recent customer context (e.g., `كيف يعني؟`).
4. Keep social intents and fallback behavior safe and consistent.

### Out
1. UI layout/styling redesign.
2. Auth/business logic changes outside chatbot.
3. Data persistence changes.

## Dependencies
1. `app/api/chat/support/route.ts`
2. `public/chatbot/knowledge-base.md`
3. `public/chatbot/system-instructions.md`
4. `public/chatbot/social-intents.md`

## API / Contract Impact
1. No request schema changes.
2. Response quality/path improvements only.

## Data Model Impact (D1/DO/R2)
1. D1: no change.
2. DO: no change.
3. R2: no change.

## Implementation plan
1. Update markdown chatbot content files with new brand naming and expanded onboarding knowledge.
2. Add context-aware retrieval query builder for short clarification follow-ups.
3. Run focused lint and local API smoke checks (greeting, gameplay, follow-up clarification, unrelated).
4. Record validation evidence and mark task done.

## Acceptance criteria
1. Chatbot content uses `جمعة العيد` instead of `هروف/حروف`.
2. KB contains clear host onboarding + player onboarding + TV mirroring guidance.
3. Follow-up clarification prompts can reuse prior customer context when relevant.
4. Unrelated questions still route to WhatsApp fallback.

## Validation checklist
- [x] Focused lint/type check.
- [x] Local API smoke checks for key scenarios.

## Validation evidence (2026-03-01)
1. PRD update in section `6.4`:
   - Added explicit chatbot naming requirement to use `جمعة العيد`.
   - Added host onboarding KB coverage requirements (login, player onboarding, TV mirroring).
   - Added follow-up clarification context requirement.
2. Chatbot content updates:
   - `public/chatbot/knowledge-base.md` rewritten with detailed host flow, player onboarding, and TV mirroring guidance.
   - `public/chatbot/system-instructions.md` updated to reference `جمعة العيد`.
   - `public/chatbot/social-intents.md` updated to use `جمعة العيد` in social responses.
3. Route updates (`app/api/chat/support/route.ts`):
   - Added context-aware retrieval query builder for clarification prompts (e.g., `كيف يعني`).
   - Added stronger Arabic token variant expansion and topic-aware ranking improvements.
4. Focused lint:
   - `npx eslint app/api/chat/support/route.ts` ✅
5. Local API smoke checks:
   - `hi` => intent greeting response ✅
   - `كيف العب` => KB-derived host response ✅
   - `كيف يعني` with previous context => KB-derived follow-up response ✅
   - `كيف اعرض الشاشة على التلفزيون؟` => KB-derived TV guidance response ✅
   - unrelated prompt => WhatsApp fallback ✅

## Rollback plan
1. Revert modified chatbot markdown files.
2. Revert retrieval context logic in API route.

## Notes/risks
1. Clarification detection is heuristic and may need tuning with real user traffic.
2. Larger KB improves coverage but should remain concise and maintainable.
