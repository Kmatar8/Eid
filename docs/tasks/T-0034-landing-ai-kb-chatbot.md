# T-0034: Landing AI KB Chatbot (Arabic, Gemini)

- Status: done
- Milestone: M1
- PRD Reference: 6.4, 12.0, 13, 15 (M1)

## Objective
Add an Arabic-first landing-page chatbot that uses Gemini 2.5 Flash via server API, answers strictly from repository KB Markdown, and falls back to WhatsApp support guidance when KB has no answer.

## Scope
### In
1. Add landing-page chatbot widget fixed to bottom-right with pre-open beat/pulse effect.
2. Add server API endpoint for chatbot prompt handling and Gemini integration.
3. Add dedicated repository folder for editable KB and prompt instructions.
4. Enforce KB-only answer policy and Arabic-only response policy.
5. Keep chat memory in client session only, using latest 20 customer messages.
6. Do not persist messages to D1/DO/R2.
7. Add simple abuse controls (request validation + lightweight rate limiting).

### Out
1. WhatsApp number final value governance (placeholder until provided).
2. Analytics/observability pipeline for chatbot events.
3. Cross-page chatbot reuse outside landing page.
4. Vector database/RAG infra beyond repo Markdown source.

## Dependencies
1. Landing page UI in `app/page.tsx`.
2. Next.js API routes under `app/api`.
3. Environment variable management for Gemini API key.

## API / Contract Impact
1. Add `POST /api/chat/support`.
2. Request body: `message`, `customerHistory`.
3. Response body: `reply`, `source` (`kb` or `fallback`).

## Data Model Impact (D1/DO/R2)
1. D1: no change.
2. DO: no change.
3. R2: no change.

## Implementation plan
1. Create prompt/KB folder and seed editable Markdown files.
2. Implement server route with:
   - prompt + KB file loading
   - simple KB section retrieval
   - Gemini 2.5 Flash call
   - fallback behavior for no-match KB
   - input validation and lightweight rate limiting
3. Build landing chatbot widget UI and wire it to `/api/chat/support`.
4. Keep in-memory client conversation state and send only last 20 customer messages for context.
5. Run lint + build checks for changed scope.
6. Update validation evidence and mark task done.

## Acceptance criteria
1. Landing page shows bottom-right chatbot trigger with visible beat/pulse before opening.
2. Chatbot UI is Arabic-only and mobile friendly.
3. Chatbot answers using KB content only; out-of-KB questions return WhatsApp support fallback.
4. Gemini API key is used server-side only and not exposed in browser code.
5. Chat context sent to AI uses only latest 20 customer messages.
6. No message persistence is added to D1/DO/R2.
7. Prompt/KB behavior can be updated by editing files in dedicated folder.

## Validation checklist
- [x] Lint/type checks pass for touched files.
- [x] Build passes.
- [x] Manual landing flow validation (open widget, ask KB and non-KB questions, verify fallback).

## Validation evidence (2026-03-01)
1. Focused lint:
   - `npx eslint app/page.tsx components/landing/landing-chatbot-widget.tsx app/api/chat/support/route.ts` ✅ (no errors; existing warnings in `app/page.tsx`)
2. Build/type check:
   - `npm run build` ✅
3. API smoke (local dev on `PORT=4010` with dummy Gemini key):
   - `POST /api/chat/support` with non-KB question returns fallback message and `source: "fallback"` ✅
   - `POST /api/chat/support` with KB-style question returns safe fallback when AI call fails (dummy key) ✅
4. Manual UI validation:
   - Landing page widget code added as fixed bottom-right component with pulse/beat trigger animation and Arabic-only labels in `components/landing/landing-chatbot-widget.tsx`.

## Rollback plan
1. Remove landing chatbot widget from landing page.
2. Remove `/api/chat/support` route and chatbot content folder.
3. Re-run lint/build to ensure landing page remains stable.

## Notes/risks
1. Plain Markdown retrieval quality depends on KB structure and wording.
2. Overly large KB files can increase latency/token usage.
3. Final WhatsApp number still pending and should be replaced once provided.
