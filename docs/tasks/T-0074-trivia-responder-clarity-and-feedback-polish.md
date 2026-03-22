# T-0074: Trivia Responder Clarity + Feedback Polish

- Status: done
- Milestone: M4
- PRD Reference: 6.1, 6.2, 8.2, 8.3, 15 (M4)

## Objective
Tighten the assigned-responder Jeopardy UX so only the chosen responder sees the countdown, everyone else sees a clear waiting message naming the active responder, and the host gets explicit wrong-answer handoff feedback without the animated wrong-answer icon swarm.

## Scope
### In
1. Update PRD wording for responder-only countdown visibility and non-responder waiting copy.
2. Show countdown digits only to the assigned responder on controller.
3. Show a clearer controller waiting state naming the answering player and team.
4. Show a host wrong-answer feedback state with score delta and explicit handoff text when the question moves to a steal responder.
5. Remove the animated wrong-answer icon swarm from the shared feedback overlay.

### Out
1. Scoring rule changes.
2. Timer duration changes.
3. Haraj UI changes.

## Dependencies
1. `PRD.md`
2. `app/controller/[roomId]/page-client.tsx`
3. `app/host/page.tsx`
4. `components/ui/feedback-animations.tsx`
5. `lib/server/types.ts`
6. `lib/server/store.ts`

## API / Contract Impact
1. No new route or action types.
2. Trivia snapshot feedback payload is extended so UI can attribute wrong answers and handoff messaging correctly.

## Data Model Impact
1. D1: no change.
2. Runtime/DO: trivia last-result snapshot includes responder attribution used by host/controller feedback UI.
3. R2: no impact.

## Implementation Plan
1. Update PRD + task doc.
2. Extend trivia feedback snapshot data needed for handoff messaging.
3. Update host/controller responder messaging and countdown rendering.
4. Remove animated wrong-answer icon swarm from shared feedback overlay.
5. Run scoped lint/typecheck/build and record evidence.

## Acceptance Criteria
1. Countdown digits appear only on the controller of the assigned responder.
2. Non-assigned controllers show a clear waiting message naming the current responder and team.
3. When the first responder answers incorrectly and the question moves to the other team, the host sees the negative score delta plus explicit handoff text naming the new responder and team.
4. Wrong-answer feedback no longer renders the animated icon swarm.
5. Scoped lint/typecheck/build pass.

## Validation Checklist
- [x] PRD updated.
- [x] Responder-only countdown implemented.
- [x] Host handoff feedback implemented.
- [x] Wrong-answer icon swarm removed.
- [x] Scoped lint/typecheck/build pass.

## Validation Evidence
1. `PRD.md` updated so the assigned responder alone sees countdown digits, non-selected players get a named waiting state, and host wrong-answer feedback explicitly includes steal handoff messaging.
2. `app/controller/[roomId]/page-client.tsx` updated so:
   - countdown digits render only when `isAssignedResponder` is true,
   - countdown status text for other players names the answering player and team,
   - reveal feedback uses the stored responder attribution from trivia result data.
3. `app/host/page.tsx` updated so:
   - wrong primary answers that immediately move to a steal responder now trigger host feedback with the negative score delta plus `تم نقل السؤال إلى ...`,
   - outdated buzzer copy in the trivia overview card was replaced with the assigned-responder flow,
   - paused-session copy now matches the current `30 minute` grace policy.
4. `components/ui/feedback-animations.tsx` updated to remove the animated wrong-answer icon swarm and use the optional `detailText` line for host handoff feedback.
5. `lib/server/types.ts` and `lib/server/store.ts` updated so trivia `lastResult` preserves responder attribution even when the clue immediately moves to the steal responder.
6. Validation commands:
   - `npx eslint app/host/page.tsx 'app/controller/[roomId]/page-client.tsx' components/ui/feedback-animations.tsx lib/server/store.ts lib/server/types.ts` ✅ (warnings only for existing `<img>` usage in host page)
   - `npx tsc --noEmit` ✅
   - `npm run build` ✅

## Rollback Plan
1. Revert PRD/controller/host wording changes.
2. Restore previous trivia last-result payload shape.
3. Restore the previous feedback overlay behavior.

## Notes / Risks
1. Host handoff feedback depends on preserving enough trivia-result context during the steal transition.
2. This is a UI/clarity polish on top of the assigned-responder runtime and should not change scoring or turn ownership.
