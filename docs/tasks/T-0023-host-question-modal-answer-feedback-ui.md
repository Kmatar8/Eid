# T-0023: Host Question Modal Answer Feedback UI

- Status: done
- Milestone: M4
- PRD Reference: 6, 14

## Objective
Refine Jeopardy host question popup visuals so answer ownership, correctness feedback, and points impact are clearer for all players in the room.

## Scope
### In
1. Replace small responder pill with a larger, more visible responder container in the same header area.
2. Add answer reveal visual logic:
   - Correct answer: flashes green then remains green.
   - Incorrect answer: chosen option flashes red then remains red; correct option turns green with circle fade-in animation.
3. Remove `Result Summary` block.
4. Show large points delta under the correct/incorrect icon during reveal.
5. Set modal CTA text to always `السؤال التالي`.

### Out
1. Gameplay/scoring logic changes.
2. Controller-side UI changes.
3. Room/session lifecycle changes.

## Dependencies
1. `app/host/page.tsx`

## API / Events / Contracts Impacted
1. None.

## Data Model Impact
1. No D1 schema changes.
2. No Durable Object state changes.
3. No KV/R2 changes.

## Implementation Plan
1. Update modal header responder UI block sizing and typography.
2. Add option-state visual mapping from `trivia.lastResult`.
3. Replace summary panel with icon + large points delta block.
4. Update next button label.
5. Validate with lint/build.

## Acceptance Criteria
1. Responder container is visibly larger and clearer than the previous pill.
2. Reveal behavior matches requested green/red animations and persistent state.
3. No `Result Summary` block appears in modal.
4. Points delta appears in large text under correct/incorrect icon.
5. CTA text is always `السؤال التالي`.

## Validation Checklist
- [x] Lint pass.
- [x] Build pass.
- [ ] Manual: reveal states match expected correct/incorrect behavior.

### Validation Evidence
1. Replaced responder pill with larger responder state container in modal header (`app/host/page.tsx`).
2. Added reveal-state option visuals:
   - correct flash-and-hold green,
   - wrong selected flash-and-hold red,
   - correct option green with ease-in circle fade on wrong answers.
3. Removed `Result Summary` panel and replaced with centered result icon + large points delta text.
4. CTA label updated to `السؤال التالي`.
5. `npm run lint` passed (warnings only, no errors).
6. `npm run build` passed successfully.

## Rollback Plan
1. Revert `app/host/page.tsx` modal UI changes.

## Notes / Risks
1. Reveal visuals depend on `trivia.lastResult`; no animation is shown when result reason is `no_buzz` or `host_skip`.
