# T-0047: Haraj Reveal UX and Input Normalization

- Status: done
- Milestone: M4
- PRD Reference: 6.1, 8.6, 12, 15

## Objective
Implement requested Haraj UX updates for host/controller: reveal layout improvements, all-submitted countdown reveal experience, and Arabic/English estimate input normalization.

## Scope
### In
1. Remove `إنهاء الفعالية` action button from Haraj reveal board action area.
2. Update Haraj reveal board layout to show product image on the left and guesses table on the right.
3. Show large `السعر الحقيقي` + value above the players guesses table.
4. Add a host-side `5` second overlay countdown before reveal details when all eligible players submitted.
5. Trigger confetti when countdown completes and reveal is shown.
6. Simplify Haraj controller collecting UI to estimate input + submit flow.
7. Accept Arabic and English numerals in Haraj estimate input and normalize to numeric English value in reveal table/runtime.

### Out
1. Haraj scoring algorithm changes.
2. Room protocol shape changes.
3. Trivia gameplay/UI updates.

## Dependencies
1. `app/host/page.tsx`
2. `app/controller/[roomId]/page-client.tsx`
3. `lib/server/store.ts`
4. `PRD.md`

## API / Contracts Impacted
1. `player.submitHarajEstimate` input parsing hardening (same contract shape, broader valid string formats).
2. No new action types or payload fields.

## Data Model Impact (D1/DO/R2)
1. D1: no schema changes.
2. Durable Object: no state schema changes; runtime parsing/transition presentation behavior only.
3. R2: no changes.

## Implementation plan
1. Update PRD Haraj section with the requested reveal/countdown and numeral-normalization behavior.
2. Add host reveal gating state for all-submitted rounds (`5` second overlay before reveal details).
3. Add reusable Haraj confetti trigger and call it after countdown completion.
4. Refactor host reveal layout to image-left/table-right and move large `السعر الحقيقي` block above table.
5. Remove reveal-board `إنهاء الفعالية` button and keep round progression action.
6. Simplify controller Haraj collecting UI to value input + submit only.
7. Add Arabic/Persian digit normalization helpers in controller and DO action parsing path.
8. Run focused lint + typecheck for affected files and record evidence.

## Acceptance criteria
1. Haraj reveal board no longer shows `إنهاء الفعالية` button in reveal action area.
2. Host reveal board renders product image left and players table right on large screens.
3. `السعر الحقيقي` is shown in prominent large text above the players table.
4. If all eligible players submit, host sees a `5` second overlay countdown before reveal content appears.
5. Confetti effect fires when reveal appears after the all-submitted countdown.
6. Controller collecting screen shows estimate entry flow without product image content.
7. Arabic digits input (e.g. `١٢٣٤`) is accepted and appears as normalized numeric value in reveal table.

## Validation checklist
- [x] Focused lint passes for modified runtime files.
- [x] Typecheck passes.
- [x] Production build passes.
- [x] Manual code-path verification confirms host countdown/reveal gating + confetti trigger and controller/server numeral normalization wiring.

## Validation evidence (2026-03-01)
1. Focused lint:
   - `npx eslint app/host/page.tsx 'app/controller/[roomId]/page-client.tsx' lib/server/store.ts` ✅ (warnings only, no errors)
2. Typecheck:
   - `npx tsc --noEmit` ✅
3. Build:
   - `npm run build` ✅
4. Implemented runtime behavior:
   - Host Haraj reveal action area no longer includes reveal-board `إنهاء الفعالية` button.
   - Host reveal layout now renders image left + table right with prominent `السعر الحقيقي`.
   - Host now applies a 5-second overlay countdown before reveal details when transition indicates all eligible players submitted, then triggers confetti.
   - Controller Haraj collecting UI is simplified to value-entry flow (no product image section).
   - Arabic/Eastern-Arabic numerals are normalized in both controller submit path and server action parser.

## Rollback plan
1. Revert `app/host/page.tsx` Haraj reveal changes to previous reveal rendering/actions.
2. Revert controller simplification and normalization helpers in `app/controller/[roomId]/page-client.tsx`.
3. Revert server-side estimate normalization fallback in `lib/server/store.ts`.
4. Revert PRD/task updates tied to this request.

## Notes/risks
1. Countdown overlay is host-UI-driven and depends on observed phase transition order.
2. Numeric normalization intentionally allows Arabic-Indic and Eastern Arabic-Indic digits; malformed mixed values are rejected.
