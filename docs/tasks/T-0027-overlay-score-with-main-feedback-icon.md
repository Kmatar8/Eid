# T-0027: Overlay Score with Main Feedback Icon

- Status: done
- Milestone: M4
- PRD Reference: 6, 14

## Objective
Display score delta directly with the main feedback icon overlay (host + controller), using strong red/green color and removing score placement below answers.

## Scope
### In
1. Extend shared feedback overlay to optionally render score delta under the main icon.
2. Wire score delta from trivia reveal state on host and controller pages.
3. Remove score rendering from host modal answer area.
4. Use strong red/green score colors matching feedback icon intent.

### Out
1. Scoring/gameplay logic changes.
2. Answer reveal correctness logic changes.
3. Session lifecycle changes.

## Dependencies
1. `components/ui/feedback-animations.tsx`
2. `app/host/page.tsx`
3. `app/controller/[roomId]/page-client.tsx`

## API / Events / Contracts Impacted
1. None.

## Data Model Impact
1. No D1 schema changes.
2. No Durable Object state changes.
3. No KV/R2 changes.

## Implementation Plan
1. Add `scoreDelta` prop to `FeedbackOverlay`.
2. Render score under main icon for `correct` and `wrong` statuses.
3. Capture `awardedPoints` into UI state during `answer_reveal` on host/controller.
4. Remove host modal inline score block.
5. Validate with lint/build.

## Acceptance Criteria
1. Score appears with the main overlay icon (above answers) on host.
2. Score appears with the main overlay icon on controllers.
3. No inline score appears below answers in host modal.
4. Score colors are strong red/green and clearly visible.

## Validation Checklist
- [x] Lint pass.
- [x] Build pass.
- [ ] Manual: host/controller show score with icon overlay only.

### Validation Evidence
1. `FeedbackOverlay` now accepts `scoreDelta` and renders the score directly below the main icon for both `correct` and `wrong` states.
2. Host and controller now set `feedbackScoreDelta` from `trivia.lastResult.awardedPoints` and pass it to `FeedbackOverlay`.
3. Host inline score block under answers was removed.
4. `npm run lint` passed (warnings only, no errors).
5. `npm run build` passed successfully.

## Rollback Plan
1. Revert overlay prop and rendering changes.
2. Revert host/controller score state wiring.

## Notes / Risks
1. Overlay auto-dismiss timing remains unchanged; only presentation is updated.
