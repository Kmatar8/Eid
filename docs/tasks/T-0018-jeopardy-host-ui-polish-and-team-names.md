# T-0018: Jeopardy Host UI Polish + Editable Team Names

- Status: in_progress
- Milestone: M4
- PRD Reference: 6.1, 8.2, 12.1

## Objective
Refine host Jeopardy interface for TV readability and operator flow: simplify action rail, improve score/live-status row composition, enable editable team names in lobby, and replace persistent notices with transient toast notifications.

## Scope
### In
1. Move host floating actions to left edge rail with only `إنهاء الفعالية` and `تسجيل خروج`.
2. Remove obsolete footer controls and `تحديث` button from host UI.
3. Restructure trivia header row into equal-width 3-column layout: `Team A score | Live Status | Team B score`.
4. Add animated beam border effect on live-status block.
5. Center score text/alignment in trivia score cards.
6. Add editable team name fields during lobby join stage.
7. Add backend support for host team rename action.
8. Convert host success notices to auto-dismiss bottom-right toast (~3 seconds).
9. Place host action rail in bottom-left corner.
10. Keep Jeopardy board centered in TV viewport without vertical page scrolling.

### Out
1. Trivia rules/timer/scoring logic changes.
2. Controller gameplay UI changes.
3. Auth/session/token model changes.

## Dependencies
1. `app/host/page.tsx`
2. `lib/server/protocol-v1.ts`
3. `lib/server/store.ts`
4. `app/api/rooms/[roomId]/actions/route.ts`

## Implementation Plan
1. Extend protocol/store/action route with `host.renameTeam`.
2. Add lobby team-name inputs wired to rename action.
3. Replace persistent notice banner with transient toast presentation.
4. Refactor trivia top row and live-status visuals.
5. Replace bottom floating toolbar with left-edge action rail.
6. Reposition action rail to bottom-left corner per operator feedback.
7. Refactor trivia viewport layout to prevent down-scroll and keep board centered.
8. Validate with lint/build and update evidence.

## Acceptance Criteria
1. Host sees only two persistent quick actions in left rail: end session + logout.
2. Trivia top row is equal thirds and scores are centered.
3. Live-status block displays current picker/team message and animated beam border.
4. Team names can be edited in lobby and reflected in UI/game.
5. Success notices auto-dismiss in bottom-right toast (no persistent banner).
6. Action rail is fixed at bottom-left corner.
7. Trivia board stays centered in viewport without page down-scrolling.
8. Lint/build pass.

## Validation Checklist
- [x] Lint pass.
- [x] Build pass.
- [ ] Manual: rename both teams in lobby and verify updated names in trivia/overview.
- [ ] Manual: host success notice appears as toast and disappears automatically.
- [ ] Manual: left rail buttons remain usable in lobby/trivia/celebration states.
- [ ] Manual: action rail renders bottom-left.
- [ ] Manual: trivia board fits TV viewport with no down-scroll.

## Validation Evidence
1. `npm run lint` passed with warnings only (no errors).
2. `npm run build` passed and includes updated room actions route.
3. Host UI now renders left-edge action rail with only `إنهاء الفعالية` and `تسجيل خروج`.
4. Host lobby now includes editable team-name inputs wired to `host.renameTeam`.
5. Success `notice` messages now render as bottom-right transient toast and auto-dismiss after ~3.2 seconds.
6. Host action rail repositioned to fixed bottom-left corner.
7. Trivia stage layout now uses viewport-fit structure (`h-[100dvh]`, centered board grid) to prevent vertical down-scroll on TV host screen.

## Rollback Plan
1. Revert host layout changes in `app/host/page.tsx`.
2. Revert `host.renameTeam` action additions in protocol/store/API route.
3. Restore old bottom toolbar and top notice banners.

## Notes / Risks
1. Team rename is restricted to pre-game setup states to avoid gameplay confusion.
2. Transient notices are intentionally non-persistent; critical failures still use persistent error banners.
