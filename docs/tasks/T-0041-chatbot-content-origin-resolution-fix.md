# T-0041: Chatbot Content Origin Resolution Fix

- Status: done
- Milestone: M1
- PRD Reference: 6.4, 12.0

## Objective
Fix production `CHATBOT_CONFIG_ERROR` caused by markdown content loading origin mismatch in `/api/chat/support`.

## Scope
### In
1. Update chatbot content loader to resolve multiple origin candidates.
2. Support explicit base URL override via `HROOF_PUBLIC_BASE_URL`.
3. Preserve existing API contract and fallback behavior.

### Out
1. Chatbot UI copy changes.
2. Gemini prompt behavior changes.
3. Data model or schema changes.

## Dependencies
1. `app/api/chat/support/route.ts`
2. Public markdown files under `public/chatbot/`.

## API / Contract Impact
1. No request/response shape changes.

## Data Model Impact (D1/DO/R2)
1. D1: no change.
2. DO: no change.
3. R2: no change.

## Implementation plan
1. Add origin candidate resolution using forwarded host headers and request origin.
2. Add optional override `HROOF_PUBLIC_BASE_URL`.
3. Retry public markdown fetch across candidate origins.
4. Run focused lint and local API smoke.

## Acceptance criteria
1. Content loader no longer relies on a single origin source.
2. Optional explicit base URL can be set via `HROOF_PUBLIC_BASE_URL`.
3. Route remains backward compatible.

## Validation checklist
- [x] Focused lint/type check.
- [x] Local API smoke check.

## Validation evidence (2026-03-01)
1. Updated `readPublicContentFile` in `app/api/chat/support/route.ts` to resolve origins from:
   - `HROOF_PUBLIC_BASE_URL`
   - `x-forwarded-host`
   - `host`
   - request origin
2. Focused lint:
   - `npx eslint app/api/chat/support/route.ts` ✅
3. Local API smoke:
   - `POST /api/chat/support` returns valid JSON response after patch ✅

## Rollback plan
1. Revert `readPublicContentFile` logic to previous single-origin fetch implementation.

## Notes/risks
1. Production fix requires deployment of this patch.
2. `HROOF_PUBLIC_BASE_URL` is optional but recommended for stable multi-domain setups.
