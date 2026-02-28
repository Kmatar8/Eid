# T-0008: Production Host Journey UI (Landing -> Login -> Lobby -> Game -> Celebration)

- Status: in_progress
- Milestone: M4
- PRD Reference: 6, 6.1, 8, 8.1, 8.2, 10.2, 12, 14

## Objective
Implement a production-oriented host journey that starts from landing CTA and runs as a single mirrored host experience: login, live lobby/team setup, game overview, trivia runtime guidance, and end-of-game celebration.

## Scope
### In
1. Route landing CTA to dedicated host login page.
2. Add `/host/login` UI using festive visual direction consistent with Eid celebration style.
3. Redesign `/host` as primary mirrored host runtime page with:
   - Large join QR code and join link.
   - Live joined players cards.
   - Two team columns and host drag/drop assignment.
   - Clear instructions and session start CTA.
4. Add host-side stage views:
   - Games overview + general rules + start-first-game CTA.
   - Trivia runtime view with horizontal scoreboard and clear responder/steal messaging.
   - End-of-trivia winner celebration view with next-game CTA.
5. Present game overview/rules directly on host stage before trivia start (without redundant popup confirmation).
6. Extend host action contract for server-authoritative manual team assignment.
7. Improve trivia controller clarity with team color coding and explicit responder text.
8. Add host fallback action to randomly select another responder from the same active team.
9. Play host-only sound effects when answer reveal is correct or wrong.
10. Show wrong-answer sticker graphics around the existing wrong icon/score feedback.
11. Enforce dark-mode-only runtime UI and disable light-mode toggle.
12. Simplify trivia live-status card by removing auxiliary lines and enlarging primary command text.
13. Vertically center the trivia live-status command text within its card.
14. Simplify controller runtime chrome by removing phase pill/update button and localizing feedback text to Arabic.
15. Tune controller buzzer/countdown copy and color styling (`اضغط` -> `جاوب`, countdown number color alignment).
16. Unify host + controller action button colors to match the join/start CTA gradient (`ابدأ الفعالية` style).
17. Localize host game-overview stage copy to Arabic, center it vertically, and replace `الجيوباردي/Jeopardy` wording with `اللعبة` in host-facing runtime copy.
18. Update landing hero wording from `ليلة` to `فعالية` for consistent event terminology.
19. Remove duplicate pre-start popup from host overview start action and restore board clue-tile color styling to prior indigo theme.
20. Revert host floating icon controls (terminate/logout) and controller buzzer to their prior visual styles while keeping other button updates.
21. Remove duplicate controller buzzer countdown display and upgrade the remaining buzzer timer block for clear, larger readability.

### Out
1. New backend game engines beyond current trivia implementation.
2. Public host signup/admin credential lifecycle.
3. Migration to websocket hibernation transport in this task.
4. New persistent schema tables for multi-game catalog.

## Dependencies
1. `T-0006` live runtime routes and client API helpers.
2. `T-0007` controller simplification/reliability changes.
3. Existing room lifecycle and trivia engine behavior in `lib/server/store.ts`.

## API / Contract Impact
1. Existing host/player routes remain in use.
2. Add host action: `host.assignPlayerTeam` with payload `{ playerId, teamId }`.
3. Add host action: `host.selectAnotherResponder` with empty payload.
4. Update protocol role authorization to permit the new host actions.
5. Preserve existing scoring and trivia action contracts.

## Data Model Impact
1. D1: no schema change.
2. DO/Runtime state: no durable schema migration; in-memory/team assignment map logic updated.
3. R2: no impact.

## Implementation Plan
1. Update PRD and planning docs for the staged host journey.
2. Add `/host/login` and wire landing CTA to it.
3. Refactor `/host` into stage-based mirrored UI (lobby -> overview -> trivia -> celebration).
4. Implement host drag/drop team assignment UX.
5. Add `host.assignPlayerTeam` protocol/store handling and preserve manual assignments when starting teams.
6. Add `host.selectAnotherResponder` protocol/store handling for in-question responder fallback.
7. Keep overview-stage rules visible and runtime team-context messaging with team-color cues.
8. Update controller question card to show explicit responder text and team cue styling.
9. Validate with lint/build + live smoke flow and capture evidence.
10. Add host-only audio preload/playback path for correct/wrong answer reveal feedback.
11. Add sticker pop animations (varied positions/sizes) around the wrong icon without replacing it.
12. Force dark theme at app shell level and disable theme toggle interactions.
13. Trim trivia live-status block to a single large command line.
14. Center trivia live-status command text vertically in the middle card.
15. Remove controller phase-status pill and bottom update button; localize controller feedback/status copy to Arabic.
16. Update controller buzzer CTA text and align countdown number color with controller buzzer color theme.
17. Apply shared join/start gradient styling to host and controller interactive buttons for visual consistency.
18. Update host overview/trivia runtime text labels to Arabic-first terminology (`اللعبة`) and adjust overview stage layout centering.
19. Adjust landing hero title copy (`ليلة العيد` -> `فعالية العيد`).
20. Remove redundant pre-start modal trigger; start trivia directly from overview CTA and keep board tile styling unchanged from prior indigo design.
21. Restore prior styling for host floating end/logout controls and controller red buzzer.
22. Keep a single controller buzzer countdown source and restyle it as a larger, clearer timer card.

## Acceptance Criteria
1. Landing CTA navigates to `/host/login`.
2. Host login succeeds and routes to `/host` with persistent host session.
3. `/host` lobby shows large QR, joined players, team columns, and supports manual team assignment.
4. Host can start session and see games overview and rules before starting trivia.
5. Trivia starts directly from the overview CTA without an extra popup confirmation.
6. Trivia runtime view clearly indicates active responder/team and steal-state messaging.
7. Host can trigger random responder reselection within the same active team when trivia question is active.
8. Controller clearly shows "this question is for you" for active responder and team/player context for others.
9. End-of-trivia celebration view announces winner/scores and exposes next-game CTA.
10. Host screen plays configured sound once per reveal result (`correct` or `wrong`).
11. Wrong-answer overlay keeps the central wrong icon and displays configured sticker pops around it.
12. Runtime pages render dark mode by default with no light-mode switch.
13. Trivia live-status card no longer shows heading/usage lines and displays larger primary status text.
14. Trivia live-status command text is vertically centered inside the card.
15. Controller no longer shows phase pill/update button, and player feedback text is Arabic.
16. Controller buzzer button label shows `جاوب` and countdown number uses aligned buzzer color tone.
17. Host and controller interactive buttons use the same gradient color direction as the `ابدأ الفعالية` CTA.
18. Host overview stage is vertically centered, fully Arabic-localized, and no longer shows `جيوباردي/Jeopardy` wording in user-facing runtime labels.
19. Landing hero headline uses `فعالية` wording instead of `ليلة`.
20. Overview start no longer opens a duplicate popup, and board clue buttons retain prior indigo visual style.
21. Host floating end/logout controls and controller buzzer match their previous styles (not gradient-unified versions).
22. During `buzzer_open`, controller shows only one countdown timer and it is visually prominent/large.

## Validation Checklist
- [x] Lint/typecheck pass.
- [x] Build pass.
- [ ] Manual: landing -> login -> host lobby flow.
- [ ] Manual: player joins and host can assign teams via drag/drop.
- [ ] Manual: overview -> direct start (no duplicate popup) -> trivia runtime messaging flow.
- [ ] Manual: host can select another responder from same team during active question.
- [ ] Manual: controller shows clear responder/team context with team color cues.
- [ ] Manual: trivia completion -> winner celebration -> next game CTA.
- [ ] Manual: host plays correct/wrong sound exactly once for each scored reveal.
- [ ] Manual: wrong-answer overlay keeps icon + score and shows sticker pops in varied positions/sizes (host/controller).
- [ ] Manual: no theme toggle is shown and runtime remains dark after reload.
- [ ] Manual: trivia live-status card shows only large primary command text.
- [ ] Manual: trivia live-status command text is vertically centered.
- [ ] Manual: controller has no phase pill/update button and shows Arabic feedback copy.
- [ ] Manual: controller buzzer label is `جاوب` and countdown number color matches buzzer tone.
- [ ] Manual: host/controller action buttons visually match `ابدأ الفعالية` gradient color style.
- [ ] Manual: host overview block is vertically centered and host runtime labels use `اللعبة` wording instead of `جيوباردي/Jeopardy`.
- [ ] Manual: landing hero text shows `فعالية العيد` (not `ليلة العيد`).
- [ ] Manual: board clue buttons use prior indigo theme styling (not the join CTA gradient).
- [ ] Manual: host floating end/logout controls and controller buzzer use their previous non-gradient styles.
- [ ] Manual: controller buzzer phase shows a single large countdown (no duplicate 20s timer).
- [x] Live smoke script still passes.

## Validation Evidence
1. `npm run lint` completed with warnings only (no errors).
2. `npm run build` completed successfully with `/host/login` and updated `/host` route output.
3. Live deploy completed to `https://hroof-app.k-matar.workers.dev` with version `83f5ed74-acf4-407c-983f-bf25cf357722`.
4. `BASE_URL=https://hroof-app.k-matar.workers.dev scripts/smoke-live.sh` passed full host/join/trivia/reconnect/end flow.
5. Added host-only answer-reveal sound playback hooks using `/sounds/correct-answer.mp3` and `/sounds/wrong-answer.mp3`.
6. Added wrong-answer overlay sticker support using `/images/stickers/wrong-sticker.png` around the central wrong icon.
7. Updated runtime theme policy to dark-only and removed light-mode switching.
8. Removed trivia live-status heading/detail/usage lines and increased primary status text size.
9. Centered trivia live-status command text vertically in the status card.
10. Removed controller phase pill/update button and localized controller feedback/status messages to Arabic.
11. Updated controller buzzer CTA label to `جاوب` and aligned countdown number color with buzzer theme.
12. Unified host/controller action button styling with the `ابدأ الفعالية` gradient palette.
13. Localized host overview and runtime labels to Arabic `اللعبة` wording and centered overview stage vertically.
14. Updated landing hero wording from `ليلة العيد` to `فعالية العيد`.
15. Removed redundant overview start popup and restored board clue button styling to the prior indigo design.
16. Restored prior host floating end/logout button styles and prior controller red buzzer style.
17. Removed duplicate controller buzzer timer text-countdown and promoted the remaining buzzer timer into a larger, clearer visual block.

## Rollback Plan
1. Revert `/host` and `/host/login` UI refactor to prior host control page.
2. Remove `host.assignPlayerTeam` action from protocol/store and restore prior team-start behavior.
3. Restore landing CTA behavior.
4. Redeploy last stable version.
5. Remove host-only sound preload/playback integration and redeploy.

## Notes / Risks
1. Drag/drop interactions need a touch-friendly fallback for tablets/phones.
2. Team assignment and start sequencing must remain server-authoritative to avoid client drift.
3. Current "next game" CTA may cycle to another trivia session until additional game engines are implemented.
4. Browser autoplay restrictions can block playback until the host interacts with the page (expected browser behavior).
