# T-0042: Chatbot Graceful Config Fallback

- Status: done
- Milestone: M1
- PRD Reference: 6.4, 12.0

## Objective
Prevent chatbot UI failures when runtime config/content loading is unavailable by degrading gracefully to safe default content and fallback replies.

## Scope
### In
1. Add default in-code KB/system/fallback content.
2. Avoid `500` for chatbot content loading failures.
3. Avoid `500` when Gemini key is missing; return fallback reply instead.

### Out
1. Core chatbot UI changes.
2. Secret management changes.
3. Knowledge-base content strategy changes.

## Dependencies
1. `app/api/chat/support/route.ts`

## API / Contract Impact
1. No request schema change.
2. Error scenarios `CHATBOT_CONFIG_ERROR` and `MISSING_GEMINI_API_KEY` now degrade to HTTP 200 fallback replies.

## Data Model Impact (D1/DO/R2)
1. D1: no change.
2. DO: no change.
3. R2: no change.

## Implementation plan
1. Introduce safe defaults for KB/system/fallback content.
2. Replace hard-fail config loading branch with graceful fallback branch.
3. Replace missing-key hard fail with fallback reply.
4. Validate with focused lint and local API smoke.

## Acceptance criteria
1. `/api/chat/support` does not return 500 for content loading issues.
2. `/api/chat/support` does not return 500 when `HROOF_GEMINI_API_KEY` is absent.
3. Endpoint returns valid fallback JSON reply in those scenarios.

## Validation checklist
- [x] Focused lint/type check.
- [x] Local API smoke.

## Validation evidence (2026-03-01)
1. `app/api/chat/support/route.ts` now initializes default KB/system/fallback constants and uses them when public markdown loading fails.
2. Missing `HROOF_GEMINI_API_KEY` now returns `200` with fallback response instead of `500`.
3. Focused lint:
   - `npx eslint app/api/chat/support/route.ts` ✅
4. Local API smoke:
   - `POST /api/chat/support` returns fallback JSON when using dummy/no key ✅

## Rollback plan
1. Revert route file to previous strict error behavior.

## Notes/risks
1. Graceful fallback prioritizes uptime over strict config visibility.
2. Operational visibility for config issues should be handled separately (logs/alerts) if needed.
