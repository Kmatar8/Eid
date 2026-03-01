# T-0040: Chatbot Host Knowledge Base + Saudi Tone Instructions

- Status: done
- Milestone: M1
- PRD Reference: 5.1, 6.1, 6.4, 8.2, 8.6, 8.7

## Objective
Upgrade chatbot knowledge content to serve hosts with practical guidance for game workflows, web app features, and correct usage steps, with system instructions aligned to a friendly Saudi-style support tone.

## Scope
### In
1. Rewrite `public/chatbot/knowledge-base.md` with host-oriented workflows and feature guidance.
2. Rewrite `public/chatbot/system-instructions.md` with Saudi dialect tone rules (friendly, welcoming, lightly funny, non-offensive).
3. Keep KB-only response policy and fallback behavior constraints intact.

### Out
1. API/route logic changes.
2. UI component copy changes.
3. WhatsApp fallback number finalization.

## Dependencies
1. Existing chatbot content loading from `public/chatbot/*.md`.
2. Product behavior reference in `PRD.md`.

## API / Contract Impact
1. None (content-only update).

## Data Model Impact (D1/DO/R2)
1. D1: no change.
2. DO: no change.
3. R2: no change.

## Implementation plan
1. Build host-focused KB sections for onboarding, gameplay, and troubleshooting.
2. Add concise FAQ entries covering common host errors and best practices.
3. Update system prompt for Saudi-friendly support style while preserving KB-only compliance.
4. Run manual API smoke to confirm markdown content loads correctly.
5. Record validation evidence and mark done.

## Acceptance criteria
1. KB clearly explains host login, room flow, team setup, Trivia flow, Haraj flow, and game switching.
2. KB includes practical host troubleshooting and usage tips.
3. System instructions enforce Saudi-friendly tone, welcoming style, and safe humor limits.
4. Chatbot behavior remains KB-only and fallback-safe.

## Validation checklist
- [x] Manual API smoke validates updated markdown files are loaded.
- [x] Manual content review confirms host workflow coverage and tone rules.

## Validation evidence (2026-03-01)
1. Updated host-oriented KB content in `public/chatbot/knowledge-base.md`:
   - Host login policy (code-only, 60-day window, single active device/session constraints).
   - End-to-end host workflow from room creation to session completion.
   - Trivia workflow, scoring, and responder handling guidance.
   - Haraj workflow, timer, scoring, tie behavior, and edge cases.
   - Game switching policy and operational troubleshooting.
2. Updated style/tone rules in `public/chatbot/system-instructions.md`:
   - Friendly Saudi dialect support style.
   - Light safe humor allowance with non-offensive guardrails.
   - Strict KB-only and fallback behavior preservation.
3. API smoke checks:
   - `POST /api/chat/support` with unrelated question returned fallback safely ✅
   - `POST /api/chat/support` with host-workflow question and no API key returned `MISSING_GEMINI_API_KEY` ✅ (confirms KB match path is active)

## Rollback plan
1. Revert `public/chatbot/knowledge-base.md` to previous version.
2. Revert `public/chatbot/system-instructions.md` to previous version.

## Notes/risks
1. Richer KB improves relevance but may require periodic updates as host UX evolves.
2. Tone instructions should remain culturally friendly and avoid sarcasm that may be misunderstood.
