# T-0058: Host Mobile TV-Mirror Guidance and Compact Mode

- Status: done
- Milestone: M4
- PRD Reference: 6.7, 10.2

## Objective
Improve host usability when running `/host` from mobile devices (especially landscape mirroring/casting to TV) by adding guidance popups and a compact display mode.

## Scope
### In
1. Add mobile-host helper popup with clear usage steps.
2. Add mobile orientation guidance overlay when host remains in portrait.
3. Add host compact display mode (toggleable) to scale down large host UI on mobile mirror scenarios.
4. Persist helper-dismiss and compact-mode preferences in local browser storage.

### Out
1. New auth roles/tokens for a dedicated public TV display route.
2. Realtime protocol changes.
3. Controller page UX changes.

## Dependencies
1. `app/host/page.tsx`
2. `PRD.md`
3. `docs/MILESTONE_BOARD.md`

## API / Contracts Impacted
1. No API contract changes.
2. No protocol event changes.

## Data Model Impact (D1/DO/R2)
1. D1: no change.
2. DO: no change.
3. R2: no change.

## Implementation plan (step-by-step)
1. Update PRD with explicit mobile-host guidance + compact-mode behavior expectations.
2. Add mobile viewport/orientation detection to host page.
3. Render onboarding helper modal for mobile hosts with practical setup steps.
4. Add orientation alert and compact-mode toggle button for mobile hosts.
5. Apply scaled host-stage rendering in compact mode for better TV mirroring fit.
6. Run lint/typecheck/build and record evidence.

## Acceptance criteria
1. On mobile host devices, a helper popup appears with clear setup instructions.
2. On mobile portrait orientation, host sees a guidance alert to rotate landscape.
3. Mobile host can toggle compact mode, and compact mode reduces oversized host rendering.
4. Helper-dismiss and compact-mode state persists on refresh in same browser.
5. No regressions to host room lifecycle or actions.

## Validation checklist
- [x] Helper popup appears on mobile host and can be dismissed.
- [x] Orientation guidance appears in portrait and hides in landscape.
- [x] Compact mode toggle works and persists.
- [x] `npx eslint app/host/page.tsx` passes.
- [x] `npx tsc --noEmit` passes.
- [x] `npm run build` passes.

## Validation evidence (2026-03-01)
1. Mobile host helper modal added with setup instructions and optional "do not show again" behavior via local storage.
2. Mobile portrait guidance alert added and auto-hidden when switching to landscape.
3. Compact mobile mode toggle added with persisted preference; host canvas scales down for mobile mirror/cast readability.
4. Validation commands:
   - `npx eslint app/host/page.tsx` ✅ (warnings only, no errors)
   - `npx tsc --noEmit` ✅
   - `npm run build` ✅

## Rollback plan
1. Revert mobile helper and compact-mode additions in `app/host/page.tsx`.
2. Revert PRD and milestone-board entries for this task.

## Notes/risks
1. Compact scaling relies on CSS transform; some browsers may render text slightly softer when scaled.
2. This is a low-risk UX adaptation and does not change server authority or game state contracts.
