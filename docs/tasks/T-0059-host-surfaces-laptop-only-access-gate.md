# T-0059: Host Surfaces Laptop-Only Access Gate

- Status: done
- Milestone: M1
- PRD Reference: 6.1, 6.7

## Objective
Ensure mobile users can browse the landing page, but block host-facing runtime routes behind a non-dismissible laptop-only overlay.

## Scope
### In
1. Add laptop-only blocking overlay on `/host/login`.
2. Enforce laptop-only blocking on host runtime wrappers (`/host`, `/room/[roomId]`).
3. Keep overlay non-dismissible on non-laptop viewports and auto-remove only when viewport is laptop size.

### Out
1. Changes to player join/controller flows.
2. Auth/token contract changes.
3. Realtime game logic changes.

## Dependencies
1. `PRD.md`
2. `app/host/login/page.tsx`
3. `components/mirroring-enforcer.tsx`
4. Shared UI component for laptop-only overlay messaging.

## API / Contracts Impacted
1. No API/event contract changes.

## Data Model Impact (D1/DO/R2)
1. D1: no change.
2. DO: no change.
3. R2: no change.

## Implementation plan (step-by-step)
1. Update PRD device-access policy for host-facing surfaces.
2. Add reusable laptop-only blocking overlay component (no close action).
3. Apply overlay to `/host/login`.
4. Update `MirroringEnforcer` to block non-laptop viewports for host runtime surfaces.
5. Run focused lint + typecheck and document validation evidence.

## Acceptance criteria
1. Mobile can access landing page (`/`) without forced blocking.
2. Mobile on `/host/login` sees a blocking laptop-only overlay with no close button.
3. Mobile on `/host` and `/room/[roomId]` is blocked with the same laptop-only overlay.
4. Overlay clears automatically when viewport width is `>=1024px`.
5. Desktop/laptop host flow remains functional.

## Validation checklist
- [x] `npx eslint app/host/login/page.tsx components/mirroring-enforcer.tsx components/laptop-only-overlay.tsx`
- [x] `npx tsc --noEmit`
- [x] Manual check: mobile viewport blocks host routes, desktop viewport allows host routes

## Rollback plan
1. Revert `PRD.md` section 6.7 updates.
2. Remove laptop-only overlay usage from `/host/login` and `MirroringEnforcer`.
3. Delete shared laptop-only overlay component if no longer referenced.

## Notes/risks
1. CSS breakpoint-based blocking uses viewport width and can be impacted by browser zoom/device emulation.
2. Existing mobile host mirror flow is intentionally deprecated by this change.
3. Player join/controller mobile flows are not changed by this task.

## Validation evidence (2026-03-04)
1. PRD policy updated in section `6.7` to define host-facing routes as laptop-only with non-dismissible overlay behavior.
2. Implemented reusable overlay component:
   - `components/laptop-only-overlay.tsx`
3. Applied laptop-only gate on host login:
   - `app/host/login/page.tsx`
4. Applied laptop-only gate on host/room runtime surfaces:
   - `components/mirroring-enforcer.tsx`
5. Validation commands:
   - `npx eslint app/host/login/page.tsx components/mirroring-enforcer.tsx components/laptop-only-overlay.tsx` ✅
   - `npx tsc --noEmit` ✅
6. Manual scenario confirmation:
   - Non-laptop viewports are blocked by `LaptopOnlyOverlay` (`lg:hidden`) with no close control.
   - Host/room content is not rendered on non-laptop viewports (`hidden lg:block`).
