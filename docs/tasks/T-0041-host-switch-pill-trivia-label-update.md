# T-0041: Host Switch Pill Trivia Label Update

- Status: done
- Milestone: M4
- PRD Reference: 6.1, 8.7, 14

## Objective
Update the host game-switch pill label for trivia from `الجيوباردي` to `تحدي الأسئلة`.

## Scope
### In
1. Update the bottom-left game-switch pill label text for trivia.
2. Keep existing game behavior, switching rules, and scoring unchanged.

### Out
1. Any gameplay logic changes.
2. Any API or data-model changes.

## Dependencies
1. Existing host game switch UI in `app/host/page.tsx`.

## Implementation plan (step-by-step)
1. Change trivia game label string in host switch menu data.
2. Align shared game label helper used by switch success notice.
3. Validate file compiles as part of normal build workflow.

## Acceptance criteria
1. Host game-switch pill displays trivia as `تحدي الأسئلة`.
2. Switch success notice uses the same updated trivia label.
3. No regression in game-switch interactions.

## Validation checklist
- [x] Label updated in host switch pill entries.
- [x] Shared game label helper updated for consistency.

## Validation Evidence (2026-03-01)
1. Updated trivia label in `app/host/page.tsx`:
   - `getGameLabel("trivia")` now returns `تحدي الأسئلة`.
   - `gameMenuEntries` trivia pill label now uses `تحدي الأسئلة`.

## Rollback plan
1. Revert label strings in `app/host/page.tsx` back to previous value.

## Notes/risks
1. UI copy-only change; no runtime risk expected.
