# T-0044: Chatbot Social Intents + Arabic Retrieval Hardening

- Status: done
- Milestone: M1
- PRD Reference: 6.4, 12.0

## Objective
Fix repetitive fallback behavior by adding explicit social-intent responses and hardening Arabic KB retrieval so host/game questions match reliably.

## Scope
### In
1. Add configurable social intent responses from markdown content.
2. Detect social intents before KB retrieval (greeting, how-are-you, thanks, goodbye, identity).
3. Improve Arabic token normalization/matching for common orthographic variants.
4. Keep KB-only support logic for product/workflow questions.
5. Preserve WhatsApp fallback for out-of-domain/no-match questions.

### Out
1. UI redesign changes.
2. Data persistence changes.
3. New external dependencies.

## Dependencies
1. `app/api/chat/support/route.ts`
2. `public/chatbot/*.md`

## API / Contract Impact
1. No request schema change.
2. Response `source` may include `intent` in addition to existing values.

## Data Model Impact (D1/DO/R2)
1. D1: no change.
2. DO: no change.
3. R2: no change.

## Implementation plan
1. Add new markdown file for social intent responses.
2. Implement markdown parser for social intent sections.
3. Add social intent detector and early-return branch.
4. Improve Arabic tokenizer with lam-normalization for common forms (`اللعب` vs `العب`) and light variant expansion.
5. Validate with local API smoke for social, game, and unrelated prompts.

## Acceptance criteria
1. Greetings and similar social messages get friendly non-fallback responses.
2. Host/game questions (e.g., "كيف العب") return KB-derived answer path.
3. Unrelated questions still return WhatsApp fallback.
4. Behavior remains configurable through markdown content files.

## Validation checklist
- [x] Focused lint/type check passes.
- [x] Local API smoke covers social + host-flow + unrelated prompts.

## Validation evidence (2026-03-01)
1. PRD updated in section `6.4` to explicitly allow safe social intents in chatbot behavior.
2. Added configurable social intent content file:
   - `public/chatbot/social-intents.md`
3. Route updates in `app/api/chat/support/route.ts`:
   - Added social intent parser and detector (`greeting`, `how_are_you`, `thanks`, `goodbye`, `identity`) with early return `source: "intent"`.
   - Improved Arabic token normalization using variant expansion (including doubled-lam handling for forms like `اللعب` vs `العب`).
   - Added domain-topic scoring boosts to prioritize practical gameplay sections for host questions.
4. Focused lint:
   - `npx eslint app/api/chat/support/route.ts` ✅
5. Local API smoke:
   - `هلا` => social intent reply (`source: "intent"`) ✅
   - `كيف العب` => KB-derived host guidance (`source: "kb_fallback"`) ✅
   - `وش عاصمة اليابان` => WhatsApp fallback (`source: "fallback"`) ✅

## Rollback plan
1. Revert route logic changes.
2. Remove social-intents markdown file.

## Notes/risks
1. Intent pattern tuning may need refinement based on real traffic wording.
2. Overly broad intent matching can accidentally intercept support questions; keep patterns conservative.
