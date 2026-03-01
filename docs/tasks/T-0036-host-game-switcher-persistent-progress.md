# T-0036: Host Game Switcher with Persistent Progress

- Status: in_progress
- Milestone: M4
- PRD Reference: 6.1 (items 9-11), 8.7, 12.1 (`host.switchGame`), 15 (M4)

## Objective
Add a host-side game switch control that can move between Trivia and Haraj during the same room session while preserving each game's progress and keeping team scores continuous.

## Scope
### In
1. Add server-authoritative `activeGame` on room snapshot/state (`trivia` | `haraj` | `null`).
2. Add host action `host.switchGame` with payload `{ gameId: "trivia" | "haraj" }`.
3. Preserve and resume in-progress game state when switching away and back.
4. Prevent switching to completed games and mark them as locked/completed in host UI.
5. Add bottom-corner host button (matching existing icon-button style) with left-side game pills for switching.
6. Keep scores shared and cumulative across game switches.
7. Keep existing sequential flow usable (host can still play in order without using switch button).

### Out
1. No new game type beyond Trivia and Haraj.
2. No redesign of gameplay scoring rules.
3. No schema migration for external database tables in this iteration.

## Dependencies
1. Server state authority in `lib/server/store.ts`.
2. Host runtime UI in `app/host/page.tsx`.
3. Action transport and validation in `lib/server/protocol-v1.ts` and `app/api/rooms/[roomId]/actions/route.ts`.
4. Controller runtime routing by snapshot state in `app/controller/[roomId]/page-client.tsx`.

## API / Contracts impacted
1. Add host action: `host.switchGame`.
2. Extend `RoomSnapshot` with `activeGame`.
3. Route idempotency set updated to require `requestId` for `host.switchGame`.

## Data Model Impact (D1/DO/R2)
1. D1: no direct schema change in this iteration.
2. Durable Object/in-memory room model: add `activeGame` pointer and switching guards.
3. R2: no change.

## Implementation plan
1. Introduce `ActiveGame` type and include it in room record + room snapshot.
2. Add helper logic for game switching guards and session activation.
3. Add `host.switchGame` handling in room action reducer:
   - validate target game
   - block completed target games
   - initialize idle game sessions on first switch
   - switch to in-progress game without resetting progress
4. Ensure timed transitions apply only to the active game to avoid background progression drift.
5. Update host stage derivation and controls to use `activeGame`.
6. Add host switch icon and pill popup UI with completed checkmark + disabled behavior.
7. Update controller runtime to respect `activeGame` when deciding which game UI to render.
8. Validate with lint/build and manual checklist.

## Acceptance criteria
1. Host can open switch menu and choose Trivia/Haraj from pills.
2. Switching away from a non-completed game preserves progress; switching back restores last progress.
3. Team scores remain unchanged by switching itself.
4. Completed game pill shows checkmark and cannot be clicked.
5. Controller view follows active game selected by host.
6. `host.switchGame` is server-authorized, idempotent, and rejects invalid transitions.
7. Sequential flow (Trivia then Haraj) still works without using switch menu.

## Validation checklist
- [x] Focused lint passes for touched files.
- [x] Build passes.
- [ ] Manual: switch from Trivia -> Haraj -> Trivia and verify progress resume.
- [ ] Manual: complete one game and verify checkmark + disabled pill.
- [ ] Manual: controller follows active game on switch.

## Validation evidence (2026-03-01)
1. Focused lint:
   - `npx eslint lib/server/types.ts lib/server/protocol-v1.ts lib/server/store.ts 'app/api/rooms/[roomId]/actions/route.ts' 'app/api/rooms/[roomId]/stream/route.ts' app/host/page.tsx 'app/controller/[roomId]/page-client.tsx' components/live/room-state-panel.tsx` ✅ (warnings only, no errors)
2. Build/type validation:
   - `npm run build` ✅
3. Implemented scope highlights:
   - `activeGame` added to room authority/snapshot with compatibility fallback.
   - `host.switchGame` implemented with timed-phase lock, progress resume, and completed-game lock.
   - Host bottom-corner switch button + game pills added with checkmark on completed games.
   - Controller rendering now follows server-selected active game.

## Rollback plan
1. Remove `host.switchGame` from protocol and action handler.
2. Remove `activeGame` from room snapshot and fall back to previous stage inference.
3. Remove host switch button + pills UI.

## Notes/risks
1. Switching during timed phases can create fairness/timing ambiguity; explicit guarding is required.
2. Compatibility with existing in-memory snapshots requires safe fallback when `activeGame` is absent.
